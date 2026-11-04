"""Estadísticas del BCV (archivos Excel de bcv.org.ve), revisadas todos los días.

- Tipo de cambio SMC (USD, EUR) por trimestre.
- Liquidez monetaria (M1, M2) semanal, base monetaria semanal, reservas internacionales diarias y
  mensuales, tasas de interés activa (semanal) y pasivas (mensual), encaje legal, balanza de pagos y
  PIB trimestral y anual. Los lectores están en bcv_files.py (verificados con los archivos reales).

Cada archivo encontrado queda registrado en `source_files` para ver en la web qué publicó el BCV.
"""
from __future__ import annotations

import datetime as dt
import io
import re
from urllib.parse import urljoin

import pandas as pd
from bs4 import BeautifulSoup

from . import bcv_files
from .common import Run, fetch, iso, save_obs, select, upsert, ve_number

BASE = "https://www.bcv.org.ve"
FOLDER = BASE + "/sites/default/files/EstadisticasGeneral/"
PAGES = ["/estadisticas/tipo-cambio-de-referencia-smc", "/estadisticas/liquidez-monetaria", "/estadisticas/base-monetaria",
         "/estadisticas/reservas-internacionales", "/estadisticas/reservas-internacionales-totales-bcvfiemfem",
         "/estadisticas/tasas-de-interes", "/estadisticas/encaje-legal", "/estadisticas/balanza-de-pagos",
         "/estadisticas/producto-interno-bruto"]
SMC_CODES = {"USD": "usd_bcv", "EUR": "eur_bcv"}
RECONVERSION = dt.date(2021, 10, 1)


def list_files(path: str, max_pages: int = 1) -> list[str]:
    urls: list[str] = []
    for p in range(max_pages):
        url = BASE + path + (f"?page={p}" if p else "")
        html = fetch(url, insecure_fallback=True, timeout=60).text
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            h = a["href"]
            if re.search(r"\.xlsx?($|\?)", h, re.I):
                full = urljoin(BASE, h)
                if full not in urls:
                    urls.append(full)
        if not soup.select_one("li.next, li.pager-next, a[rel=next]"):
            break
    return urls


def smc_sort_key(url: str):
    m = re.search(r"2_1_2([a-d])(\d{2})", url, re.I)
    return (int(m.group(2)), m.group(1).lower()) if m else (0, "")


def read_book(url: str) -> dict[str, pd.DataFrame]:
    content = fetch(url, insecure_fallback=True, timeout=90).content
    engine = "xlrd" if url.lower().split("?")[0].endswith(".xls") else "openpyxl"
    return pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, engine=engine)


# ------------------------------------------------------------------ parsers
def to_date(x) -> dt.date | None:
    if isinstance(x, (dt.datetime, pd.Timestamp)):
        return x.date()
    if isinstance(x, dt.date):
        return x
    s = str(x).strip()
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return dt.date(y, mo, d)
        except ValueError:
            return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return dt.date(*map(int, m.groups()))
    return None


def parse_smc(book: dict[str, pd.DataFrame]) -> dict[str, list]:
    out: dict[str, list] = {c: [] for c in SMC_CODES.values()}
    for name, df in book.items():
        fecha = None
        for v in df.astype(str).values.ravel():
            if "fecha valor" in v.lower():
                fecha = to_date(v)
                if fecha:
                    break
        if not fecha:
            m = re.fullmatch(r"(\d{2})(\d{2})(\d{4})", str(name).strip())
            if m:
                fecha = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if not fecha:
            continue
        for row in df.itertuples(index=False):
            cells = [str(c).strip() for c in row]
            code = next((c for c in cells if c in SMC_CODES), None)
            if not code:
                continue
            nums = [n for n in (ve_number(c) if isinstance(c, str) else c for c in row)
                    if isinstance(n, (int, float)) and not pd.isna(n) and n > 0]
            if nums:
                v = float(nums[-1])
                if fecha < RECONVERSION and v > 1000:  # Bs.S antes de la reconversión de oct-2021 → Bs de hoy
                    v /= 1e6
                out[SMC_CODES[code]].append((fecha, v))
    return out



def run(backfill: bool = False):
    with Run("bcv_stats") as r:
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        found: dict[str, str] = {}
        smc_files: list[str] = []
        for path in PAGES:
            try:
                files = list_files(path, max_pages=25 if (backfill and "smc" in path) else 1)
            except Exception:  # noqa: BLE001
                continue
            for u in files:
                found[u] = path
                if "_smc" in u.lower():
                    smc_files.append(u)
        if found:
            upsert("source_files", [{"url": u, "page": p, "filename": u.rsplit("/", 1)[-1], "last_seen": now} for u, p in found.items()], "url")
        else:
            r.note("No se pudo leer ninguna página de estadísticas del BCV; se intentan los archivos directos")

        # 1) Tipo de cambio SMC
        targets = sorted(set(smc_files), key=smc_sort_key, reverse=True)
        for u in (targets if backfill else targets[:1]):
            try:
                for code, pts in parse_smc(read_book(u)).items():
                    r.rows += save_obs(code, pts, "BCV (SMC)")
            except Exception as e:  # noqa: BLE001
                r.note(f"SMC {u.rsplit('/', 1)[-1]}: {e}")

        # 2) Series estadísticas: archivos descubiertos + nombres conocidos en la carpeta pública
        done = set()
        candidates = [u for u in found if bcv_files.parser_for(u)] + [FOLDER + f for f in bcv_files.KNOWN_FILES]
        changed: dict[str, str] = {}
        for u in candidates:
            fn = bcv_files.parser_for(u)
            if not fn or fn.__name__ in done:
                continue
            try:
                content = fetch(u, insecure_fallback=True, timeout=120, retries=2).content
                series = bcv_files.postprocess(bcv_files.parse_file(u.rsplit("/", 1)[-1], content))
            except Exception as e:  # noqa: BLE001
                if u.startswith(FOLDER):
                    r.log.info("%s: %s", u.rsplit("/", 1)[-1], e)
                continue
            if not series:
                changed.setdefault(fn.__name__, u.rsplit('/', 1)[-1])
                continue
            done.add(fn.__name__)
            upsert("source_files", [{"url": u, "page": "BCV", "filename": u.rsplit("/", 1)[-1], "last_seen": now}], "url")
            from .common import archive
            archive("bcv", u.rsplit("/", 1)[-1], content)
            for code, pts in series.items():
                r.rows += save_obs(code, pts, "BCV")
        for name, f in changed.items():  # solo avisa si ningún otro archivo sirvió para esa serie
            if name not in done:
                r.note(f"{f}: el formato cambió (sin datos reconocibles)")
        missing = {p[1].__name__ for p in bcv_files.PARSERS} - done - set(changed)
        if missing:
            r.note("Sin publicación encontrada hoy para: " + ", ".join(sorted(missing)))

        r.rows += derived()


def derived() -> int:
    """Serie calculada: multiplicador monetario (M2 ÷ base). Los valores en US$ los calcula la web con el selector de moneda."""
    # toda la historia (liquidez desde 1997, base desde 2001): el multiplicador sale para todas las fechas comunes
    get = lambda c: {x["date"]: x["value"] for x in select("observations", {
        "select": "date,value", "series_code": f"eq.{c}", "order": "date"})}
    m2, base = get("liquidez_m2"), get("base_monetaria")
    n = 0
    # Corrige tasas SMC 2020-2021 guardadas en Bs.S (sin reexpresar) por corridas anteriores
    for code in SMC_CODES.values():
        old = select("observations", {"select": "date,value", "series_code": f"eq.{code}",
                                      "date": "lt.2021-10-01", "value": "gt.1000"})
        if old:
            n += save_obs(code, [(x["date"], x["value"] / 1e6) for x in old], "BCV (SMC)")
    if m2 and base:
        n += save_obs("multiplicador", [(d, m2[d] / base[d]) for d in m2 if d in base and base[d]], "Cálculo propio")
    return n
