"""SUNAVAL · informe mensual del sector valores ("Guacho"/"Infovalores").

Extrae:
- Mercado de Otros Bienes (BVC): operaciones y monto en US$ por mes.
- Volumen total negociado en la BVC en el mes (US$).
- BOLPRIAVEN: monto negociado (US$) del cuadro "Resumen del Mercado de Valores".
"""
from __future__ import annotations

import datetime as dt
import io
import re

from .common import Run, fetch, save_obs, upsert, ve_number

PAGE = "https://www.sunaval.gob.ve/mensuales-2/"
MON = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "sept": 9,
       "oct": 10, "nov": 11, "dic": 12}
MONTHS = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                       "septiembre", "octubre", "noviembre", "diciembre"], 1)}
ROW = re.compile(r"\b(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.?\s*[-/]?\s*(\d{2,4})\s+([\d.]+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)", re.I)


def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def list_reports() -> list[tuple[str, str]]:
    """[(url, 'AAAA-MM')] ordenados del más reciente al más antiguo."""
    html = fetch(PAGE, timeout=60).text
    out = []
    for m in re.finditer(r'href="([^"]+\.pdf)"', html, re.I):
        u = m.group(1)
        name = u.rsplit("/", 1)[-1].lower()
        mm = next((n for k, n in MONTHS.items() if k in name), None)
        yy = re.search(r"(20\d\d)", name)
        if mm and yy and ("guacho" in name or "infovalores" in name or "sector-valores" in name):
            out.append((u, f"{yy.group(1)}-{mm:02d}"))
    return sorted(dict(out).items(), key=lambda x: x[1], reverse=True)


def parse_text(text: str, period: str) -> dict[str, list]:
    out = {"mob_monto": [], "mob_operaciones": [], "bvc_volumen_usd": [], "bolpriaven_monto": []}
    # Mercado de Otros Bienes: filas "sept. 2026 347 208.432.488.395,41 249.170.938,93"
    i = text.lower().find("mercado de otros bienes")
    while i != -1:
        chunk = text[i:i + 2500]
        rows = ROW.findall(chunk)
        if rows:
            for mon, yy, ops, _bs, usd in rows:
                y = int(yy) + (2000 if len(yy) == 2 else 0)
                d = eom(y, MON[mon.lower()])
                out["mob_operaciones"].append((d, ve_number(ops.replace(".", "")) or 0))
                out["mob_monto"].append((d, (ve_number(usd) or 0) / 1e6))
            break
        i = text.lower().find("mercado de otros bienes", i + 10)
    y, m = map(int, period.split("-"))
    d = eom(y, m)
    t = re.search(r"Total,?\s*Volumen negociado en el mes[^()]*\(expresado en USD\)\D{0,40}([\d.]+,\d+)", text, re.I)
    if t:
        out["bvc_volumen_usd"].append((d, (ve_number(t.group(1)) or 0) / 1e6))
    b = re.search(r"BOLPRIAVEN\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+(\d+)", text)
    if b:
        out["bolpriaven_monto"].append((d, ve_number(b.group(2))))
    return out


def pdf_text(content: bytes) -> str:
    import pdfplumber  # type: ignore
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def run(backfill: bool = False):
    with Run("sunaval") as r:
        reports = list_reports()
        if not reports:
            r.note("No se encontraron informes mensuales en la página de SUNAVAL")
            return
        todo = list(reversed(reports[:48])) if backfill else reports[:2]
        for url, period in todo:
            try:
                data = parse_text(pdf_text(fetch(url, timeout=120).content), period)
            except Exception as e:  # noqa: BLE001
                r.note(f"{period}: {e}")
                continue
            for code, pts in data.items():
                r.rows += save_obs(code, pts, f"SUNAVAL ({period})")
            upsert("source_files", [{"url": url, "page": "SUNAVAL mensual", "filename": url.rsplit("/", 1)[-1]}], "url")
            if not any(data.values()):
                r.note(f"{period}: sin cifras reconocibles")
