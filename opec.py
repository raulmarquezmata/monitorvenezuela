"""OPEP · Monthly Oil Market Report (MOMR): producción de Venezuela y precio de la cesta Merey.

Calendario 2026 de publicación (mediodía de Viena): 14-ene, 11-feb, 11-mar, 13-abr, 13-may, 11-jun,
13-jul, 12-ago, 10-sep, 13-oct, 11-nov, 14-dic. El robot diario revisa si hay informe nuevo.

Del PDF se extrae:
- "crude oil production based on secondary sources" → fila Venezuela (miles b/d, últimos 3 meses)
- "crude oil production based on direct communication" → fila Venezuela
- "OPEC Reference Basket and selected crudes" → fila Merey (US$/b, últimos 2 meses)
"""
from __future__ import annotations

import datetime as dt
import io
import re

from .common import Run, fetch, save_obs, today_caracas, upsert

PAGE = "https://www.opec.org/monthly-oil-market-report.html"
MIRROR = "https://egyptoil-gas.com/wp-content/uploads/{fy}/{fm:02d}/OPEC_MOMR_{month}_{y}.pdf"
MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
             "October", "November", "December"]
MON3 = {m[:3]: i for i, m in enumerate(MONTHS_EN, 1)}
TOKEN = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2})\b")
NUM = re.compile(r"-?\d[\d,]*\.?\d*|\.\.")


def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def get(url: str, timeout: int = 90):
    """Con suplantación de navegador si está curl_cffi (opec.org filtra bots)."""
    try:
        from curl_cffi import requests as creq  # type: ignore
        r = creq.get(url, impersonate="chrome", timeout=timeout)
        r.raise_for_status()
        return r
    except ImportError:
        return fetch(url, timeout=timeout)


def find_pdfs(back_months: int = 3) -> list[str]:
    urls = []
    try:
        html = get(PAGE, 40).text
        for m in re.finditer(r'href="([^"]+?\.pdf)"', html, re.I):
            u = m.group(1)
            if "momr" in u.lower():
                urls.append(u if u.startswith("http") else "https://www.opec.org" + u)
    except Exception:  # noqa: BLE001
        pass
    t = today_caracas()
    for back in range(0, back_months):  # espejo público: informe del mes y anteriores
        y, m = t.year, t.month - back
        while m <= 0:
            y, m = y - 1, m + 12
        name = MONTHS_EN[m - 1]
        urls += [f"https://www.opec.org/assets/assetdb/momr-{name.lower()}-{y}.pdf",
                 f"https://www.opec.org/opec_web/static_files_project/media/downloads/MOMR%20{name}%20{y}.pdf",
                 f"https://www.opec.org/opec_web/static_files_project/media/downloads/publications/MOMR%20{name}%20{y}.pdf"]
        for fy, fm in ((y, m), (y + (m == 12), m % 12 + 1)):  # carpeta del mes del informe o del siguiente
            urls.append(MIRROR.format(fy=fy, fm=fm, month=name, y=y))
    return list(dict.fromkeys(urls))


def months_in(line: str) -> list[tuple[int, int]]:
    out = []
    for mon, yy in TOKEN.findall(line):
        k = (2000 + int(yy), MON3[mon])
        if k not in out:
            out.append(k)
    return out


def parse_text(text: str) -> dict[str, list]:
    out = {"petroleo_prod_opep_fs": [], "petroleo_prod_opep_cd": [], "merey": []}
    pages = text.split("\f")
    for page in pages:
        low = page.lower()
        for key, code in (("based on secondary sources", "petroleo_prod_opep_fs"), ("based on direct communication", "petroleo_prod_opep_cd")):
            if key in low and "venezuela" in low and not out[code]:
                # las dos tablas suelen ir en la misma página: se toma solo el tramo de la tabla buscada
                part = page[low.index(key):]
                other = "based on direct communication" if code.endswith("_fs") else "based on secondary sources"
                if other in part.lower():
                    part = part[:part.lower().index(other)]
                lines = page[:low.index(key)].splitlines()[-1:] + part.splitlines()
                for i, ln in enumerate(lines):
                    if ln.strip().lower().startswith("venezuela"):
                        header = next((h for h in reversed(lines[:i]) if len(months_in(h)) >= 3), "")
                        mons = months_in(header)[:3]
                        nums = [n for n in NUM.findall(ln[len("venezuela"):])]
                        if len(mons) == 3 and len(nums) >= 4:
                            vals = nums[-4:-1]
                            for (y, m), v in zip(mons, vals):
                                if v != "..":
                                    out[code].append((eom(y, m), float(v.replace(",", ""))))
                        break
        if "reference basket" in low and "merey" in low and not out["merey"]:
            lines = page.splitlines()
            for i, ln in enumerate(lines):
                if ln.strip().lower().startswith("merey"):
                    header = next((h for h in reversed(lines[:i]) if len(months_in(h)) >= 2), "")
                    mons = months_in(header)[:2]
                    nums = NUM.findall(ln[len("merey"):])
                    if len(mons) == 2 and len(nums) >= 2:
                        for (y, m), v in zip(mons, nums[:2]):
                            out["merey"].append((eom(y, m), float(v.replace(",", ""))))
                    break
    return out


def pdf_text(content: bytes) -> str:
    import pdfplumber  # type: ignore
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\f".join((p.extract_text() or "") for p in pdf.pages)


LOCAL = __import__("pathlib").Path(__file__).resolve().parent.parent / "data" / "momr"


def run(backfill: bool = False, local_only: bool = False):
    with Run("opec") as r:
        # 1) Informes MOMR subidos a mano a data/momr/ (por si opec.org bloquea al robot), del más viejo al más nuevo
        def key(pth):
            n = pth.stem.lower()
            y = re.search(r"20\d\d", n)
            m = next((i for i, mm in enumerate(MONTHS_EN, 1) if mm.lower()[:3] in n), 0)
            return (int(y.group(0)) if y else 0, m)
        for pth in sorted(LOCAL.glob("*.pdf"), key=key):
            data = parse_text(pdf_text(pth.read_bytes()))
            for code, pts in data.items():
                r.rows += save_obs(code, pts, f"OPEP MOMR ({pth.name})")
        if local_only:
            return
        tried, got = [], False
        for url in (list(reversed(find_pdfs(30))) if backfill else find_pdfs(3)):  # en backfill, del más viejo al más nuevo
            name = url.rsplit("/", 1)[-1]
            try:
                content = get(url).content
                if not content.startswith(b"%PDF"):
                    continue
            except Exception:  # noqa: BLE001
                tried.append(name)
                continue
            data = parse_text(pdf_text(content))
            n = sum(len(v) for v in data.values())
            if not n:
                r.note(f"{name}: sin filas de Venezuela/Merey reconocibles")
                continue
            for code, pts in data.items():
                r.rows += save_obs(code, pts, f"OPEP MOMR ({name})")
            upsert("source_files", [{"url": url, "page": "OPEP MOMR", "filename": name}], "url")
            got = True
            if not backfill:
                break  # el más reciente basta: trae los últimos 3 meses (con revisiones)
        if not got:
            from .common import select
            last = select("observations", {"select": "date", "series_code": "eq.merey", "order": "date.desc", "limit": 1})
            if not last or last[0]["date"] < (today_caracas() - dt.timedelta(days=50)).isoformat():
                r.note("No se pudo descargar el MOMR más reciente (opec.org o espejo). Si ya salió, súbelo a data/momr/.")
