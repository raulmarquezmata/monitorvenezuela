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
from urllib.parse import urljoin

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


def fix_url(u: str) -> str:
    """SUNAVAL publica enlaces como 'https:///wp-content/...' o '/wp-content/...'."""
    u = u.strip().replace("&amp;", "&")
    u = re.sub(r"^https?:/{3,}", "/", u)
    if u.startswith("//"):
        u = "https:" + u
    return urljoin(PAGE, u)


def list_reports() -> list[tuple[str, str]]:
    """[(url, 'AAAA-MM')] ordenados del más reciente al más antiguo."""
    html = fetch(PAGE, timeout=60).text
    out = []
    for m in re.finditer(r'href="([^"]+\.pdf)"', html, re.I):
        u = fix_url(m.group(1))
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
        out["bolpriaven_monto"].append((d, (ve_number(b.group(2)) or 0) / 1e6))
    return out


MESN = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "sept": 9,
        "oct": 10, "nov": 11, "dic": 12}
OCR_ROW = re.compile(r"\b(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.?\s+(20\d\d)\s+(\d[\d.]*)\s+([\d.]+,\d+)\s+([\d.]+,\d+)", re.I)
NUM = r"(?<![\d.,])(\d{1,3}(?:\.\d{3})*,\d+)(?![\d,]*\s*%)"  # montos, no porcentajes


def ocr_pages(content: bytes) -> dict[str, str]:
    """Desde 2026 SUNAVAL pega las tablas como imágenes: se ubican las páginas por su título
    (que sí es texto) y se leen con OCR (tesseract). Devuelve {'mob'|'total'|'bolp': texto}."""
    import shutil
    import subprocess
    import tempfile

    import pdfplumber  # type: ignore
    if not shutil.which("tesseract"):
        return {}
    out: dict[str, str] = {}
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            key = ("total" if "Total, Volumen negociado" in t else
                   "bolp" if "Detalle Diario de Operaciones" in t and "Bolpriaven" in t else
                   "mob" if "Operaciones en el Mercado de Otros Bienes" in t and "mero de Operaciones" in t else None)
            if not key or key in out:
                continue
            with tempfile.NamedTemporaryFile(suffix=".png") as f:
                page.to_image(resolution=250).save(f.name)
                txt = subprocess.run(["tesseract", f.name, "-", "--psm", "6"], capture_output=True, text=True, timeout=120).stdout
            # el OCR a veces separa o confunde separadores: '801, 13' → '801,13' · '29:872' → '29.872'
            txt = re.sub(r"(?<=\d)([.,:]) (?=\d)", r"\1", txt)
            out[key] = re.sub(r"(?<=\d):(?=\d{3})", ".", txt)
    return out


def parse_ocr(pages: dict[str, str], period: str) -> dict[str, list]:
    out = {"mob_monto": [], "mob_operaciones": [], "bvc_volumen_usd": [], "bolpriaven_monto": []}
    y, m = map(int, period.split("-"))
    prev = (y, m - 1) if m > 1 else (y - 1, 12)
    for mon, yy, ops, _bs, usd in OCR_ROW.findall(pages.get("mob", "")):
        d = eom(int(yy), MESN[mon.lower()])
        out["mob_operaciones"].append((d, float(ops.replace(".", ""))))
        out["mob_monto"].append((d, (ve_number(usd) or 0) / 1e6))
    tot = pages.get("total", "")
    for line in tot.splitlines():  # fila de totales: actual, mes anterior, var., mismo mes año anterior, var.
        nums = re.findall(NUM, line)
        if len(nums) >= 2 and re.match(r"\s*[\d.]+,\d", line):
            out["bvc_volumen_usd"] += [(eom(y, m), ve_number(nums[0]) / 1e6), (eom(*prev), ve_number(nums[1]) / 1e6)]
            if len(nums) >= 3:
                out["bvc_volumen_usd"].append((eom(y - 1, m), ve_number(nums[2]) / 1e6))
            break
    b = re.search(r"Total general\s+(\d+)\s+([\d.]+(?:,\d+)?)\s+([\d.]+(?:,\d+)?)", pages.get("bolp", ""))
    if b:
        out["bolpriaven_monto"].append((eom(y, m), float(b.group(3).replace(".", "").replace(",", ".")) / 1e6))
    return out


def pdf_text(content: bytes) -> str:
    import pdfplumber  # type: ignore
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


LOCAL = __import__("pathlib").Path(__file__).resolve().parent.parent / "data" / "sunaval"


def period_from_name(name: str) -> str | None:
    n = name.lower()
    mm = next((v for k, v in MONTHS.items() if k in n), None)
    yy = re.search(r"(20\d\d)", n)
    return f"{yy.group(1)}-{mm:02d}" if mm and yy else None


def parse_report(content: bytes, period: str) -> dict:
    data = parse_text(pdf_text(content), period)
    if not data["bvc_volumen_usd"] or not data["mob_monto"]:
        for k, v in parse_ocr(ocr_pages(content), period).items():
            if v:
                data[k] = v
    return data


def run(backfill: bool = False):
    with Run("sunaval") as r:
        # 1) informes subidos a mano a data/sunaval/ (SUNAVAL bloquea a veces al robot)
        for pth in sorted(LOCAL.glob("*.pdf")):
            per = period_from_name(pth.name)
            if not per:
                r.note(f"{pth.name}: no se reconoce el mes en el nombre")
                continue
            for code, pts in parse_report(pth.read_bytes(), per).items():
                r.rows += save_obs(code, pts, f"SUNAVAL ({per})")
        try:
            reports = list_reports()
        except Exception as e:  # noqa: BLE001
            r.note(f"La página de SUNAVAL no respondió ({str(e)[:80]}). Si hace falta, sube el informe a data/sunaval/.")
            return
        if not reports:
            r.note("No se encontraron informes mensuales en la página de SUNAVAL")
            return
        todo = list(reversed(reports[:48])) if backfill else reports[:2]
        for url, period in todo:
            try:
                content = fetch(url, timeout=120).content
                from .common import archive
                archive("sunaval", url.rsplit("/", 1)[-1], content)
                data = parse_report(content, period)
            except Exception as e:  # noqa: BLE001
                r.note(f"{period}: {e}")
                continue
            for code, pts in data.items():
                r.rows += save_obs(code, pts, f"SUNAVAL ({period})")
            upsert("source_files", [{"url": url, "page": "SUNAVAL mensual", "filename": url.rsplit("/", 1)[-1]}], "url")
            if not any(data.values()):
                r.note(f"{period}: sin cifras reconocibles")
