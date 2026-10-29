"""Lectores de los archivos estadísticos del BCV (verificados con archivos reales de oct-2026).

Cada lector recibe el libro de Excel (todas las hojas) y devuelve {codigo_serie: [(fecha, valor)]}.
`parse_file(nombre, contenido)` elige el lector según el nombre del archivo del BCV.

Unidades: los saldos monetarios se re-expresan a la unidad actual (miles de Bs posteriores a la
reconversión de oct-2021) empalmando los saltos de las reconversiones de 2008, 2018 y 2021.
"""
from __future__ import annotations

import datetime as dt
import io
import math
import re

import pandas as pd

MONTHS = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                       "septiembre", "octubre", "noviembre", "diciembre"], 1)}
MON3 = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4}


# ------------------------------------------------------------------ utilidades
def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def to_date(x) -> str | None:
    if isinstance(x, (dt.datetime, pd.Timestamp)):
        return x.date().isoformat()
    if isinstance(x, dt.date):
        return x.isoformat()
    m2 = re.search(r"(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*\.?[-/ ](\d{2,4})", str(x))
    if m2 and m2.group(2).lower() in {**MON3, "jan": 1, "apr": 4, "aug": 8, "dec": 12}:
        mo = {**MON3, "jan": 1, "apr": 4, "aug": 8, "dec": 12}[m2.group(2).lower()]
        y = int(m2.group(3)); y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, int(m2.group(1))).isoformat()
        except ValueError:
            return None
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", str(x))
    if m:
        d, mo, y = map(int, m.groups())
        y += 2000 if y < 100 else 0
        try:
            return dt.date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


def num(x) -> float | None:
    if isinstance(x, (int, float)) and not (isinstance(x, float) and math.isnan(x)):
        return float(x)
    if isinstance(x, str):
        s = x.strip().replace("(*)", "").replace("*", "")
        if re.fullmatch(r"-?\d+(\.\d+)?", s):
            return float(s)
    return None


def year_of(x) -> int | None:
    m = re.search(r"(19|20)\d\d", str(x))
    return int(m.group(0)) if m else None


def splice(points: list[tuple[str, float]], max_jump: float = 30.0, max_gap_days: int = 75) -> list[tuple[str, float]]:
    """Empalma reconversiones: recorre del más nuevo al más viejo y, si entre dos observaciones
    consecutivas hay un salto mayor a `max_jump` veces, re-escala lo anterior por la potencia de 10
    más cercana. Deja toda la serie en la unidad de la observación más reciente."""
    pts = sorted(points)
    if len(pts) < 2:
        return pts
    out = [pts[-1]]
    factor = 1.0
    for i in range(len(pts) - 2, -1, -1):
        cur, nxt = pts[i][1], pts[i + 1][1]
        gap = (dt.date.fromisoformat(pts[i + 1][0]) - dt.date.fromisoformat(pts[i][0])).days
        if cur and nxt and cur * nxt > 0 and gap <= max_gap_days:
            ratio = abs(cur / nxt)
            if ratio > max_jump or ratio < 1 / max_jump:
                factor *= 10 ** round(math.log10(ratio))
        out.append((pts[i][0], pts[i][1] / factor))
    return sorted(out)


def find_row(df: pd.DataFrame, pattern: str, col: int = 0) -> int | None:
    rx = re.compile(pattern, re.I)
    for i in range(len(df)):
        if isinstance(df.iat[i, col], str) and rx.search(df.iat[i, col].strip()):
            return i
    return None


def dedupe(pts):
    return sorted({d: v for d, v in pts if d and v is not None}.items())


# ------------------------------------------------------------------ monetario
def liquidez_semanal(book) -> dict:
    """liquidez_monetaria_semanal: filas = semanas; columnas Monedas, Vista, Ahorro, Dinero (M1), Cuasidinero, M2."""
    m1, m2 = [], []
    for df in book.values():
        for i in range(len(df)):
            d = to_date(df.iat[i, 0])
            if not d:
                continue
            row = [num(df.iat[i, j]) for j in range(1, min(8, df.shape[1]))]
            if len(row) >= 6 and row[5]:
                m2.append((d, row[5]))
                if row[3]:
                    m1.append((d, row[3]))
    return {"liquidez_m2": splice(dedupe(m2)), "dinero_m1": splice(dedupe(m1))}


def _wide_dates(df: pd.DataFrame, label_rx: str) -> list:
    """Tabla con fechas en columnas (base monetaria semanal): devuelve [(fecha, valor)] de la fila buscada."""
    hdr = next((i for i in range(min(12, len(df))) if sum(to_date(x) is not None for x in df.iloc[i].tolist()) >= 2), None)
    row = find_row(df, label_rx)
    if hdr is None or row is None:
        return []
    out = []
    for j in range(1, df.shape[1]):
        d, v = to_date(df.iat[hdr, j]), num(df.iat[row, j])
        if d and v is not None:
            out.append((d, v))
    return out


def base_semanal(book) -> dict:
    pts = []
    for df in book.values():
        pts += _wide_dates(df, r"^FUENTES")
    return {"base_monetaria": splice(dedupe(pts))}


def _month_cols(df: pd.DataFrame):
    """Fila de encabezado tipo 'Sep 2026 (*)' → {col: fecha fin de mes}."""
    for i in range(min(10, len(df))):
        cols = {}
        for j in range(1, df.shape[1]):
            m = re.match(r"\s*([A-Za-zé]{3})[a-z]*\.?\s+(\d{4})", str(df.iat[i, j]))
            if m and m.group(1).lower()[:3] in MON3:
                cols[j] = eom(int(m.group(2)), MON3[m.group(1).lower()[:3]])
        if len(cols) >= 2:
            return i, cols
    return None, {}


def liquidez_mensual(book) -> dict:
    m2 = []
    for df in book.values():
        _, cols = _month_cols(df)
        r = find_row(df, r"Liquidez Monetaria \(M2\)|^Liquidez Monetaria$")
        if r is None:
            continue
        m2 += [(d, num(df.iat[r, j])) for j, d in cols.items()]
    return {"liquidez_m2_mensual": splice(dedupe(m2))}


def base_mensual(book) -> dict:
    pts = []
    for df in book.values():
        _, cols = _month_cols(df)
        r = find_row(df, r"^FUENTES")
        if r is not None:
            pts += [(d, num(df.iat[r, j])) for j, d in cols.items()]
    return {"base_monetaria_mensual": splice(dedupe(pts))}


# ------------------------------------------------------------------ reservas
def reservas_diarias(book) -> dict:
    """2_1_1: hojas por año; FECHA | BCV | FEM | TOTAL (US$) | ... (EUR, CNY)."""
    pts = []
    for df in book.values():
        for i in range(len(df)):
            d = to_date(df.iat[i, 0])
            v = num(df.iat[i, 3]) if df.shape[1] > 3 else None
            if d and v:
                pts.append((d, v))
    return {"reservas_internacionales": dedupe(pts)}


def reservas_mensuales(book) -> dict:
    """2_3_1: año en una fila y meses debajo; PERÍODO | BCV | FIEM/FEM | TOTAL."""
    df = list(book.values())[0]
    pts, year = [], None
    for i in range(len(df)):
        lab = str(df.iat[i, 0]).strip()
        y = year_of(lab)
        if y and re.fullmatch(r"(19|20)\d\d\s*\(?\*?\)?", lab):
            year = y
            continue
        mo = MONTHS.get(re.sub(r"[^a-záé]", "", lab.lower()))
        v = num(df.iat[i, 3]) if df.shape[1] > 3 else None
        if year and mo and v:
            pts.append((eom(year, mo), v))
    return {"reservas_internacionales_mensual": dedupe(pts)}


# ------------------------------------------------------------------ tasas y encaje
def tasa_activa_semanal(book) -> dict:
    """1_1_7: 'Semana al' | fecha | Activa | Pagarés | Préstamos | ... (la activa es la primera numérica)."""
    df = list(book.values())[0]
    pts = []
    for i in range(len(df)):
        if not str(df.iat[i, 0]).lower().startswith("semana"):
            continue
        d = to_date(df.iat[i, 1])
        v = num(df.iat[i, 2]) if df.shape[1] > 2 else None
        if d and v is not None:
            pts.append((d, v))
    return {"tasa_activa": dedupe(pts)}


def _year_month_rows(df: pd.DataFrame):
    """Itera (fecha fin de mes, índice de fila) en tablas con fila de año seguida de filas de meses."""
    year = None
    for i in range(len(df)):
        lab = str(df.iat[i, 0]).strip()
        if re.fullmatch(r"(19|20)\d\d(\s*\(?\*\)?)?", lab):
            year = int(lab[:4])
            continue
        mo = MONTHS.get(re.sub(r"[^a-záé]", "", lab.lower().split("(")[0]))
        if year and mo:
            yield eom(year, mo), i


def tasas_pasivas_mensual(book) -> dict:
    """1_1_6: Depósitos de ahorro | Cuentas corrientes remuneradas | Depósitos a plazo (total) | ..."""
    df = list(book.values())[0]
    hdr = find_row(df, r"Base de c[aá]lculo")
    cols = {}
    if hdr is not None:
        for j in range(1, df.shape[1]):
            h = str(df.iat[hdr, j]).lower()
            if "ahorro" in h and "ahorro" not in cols:
                cols["ahorro"] = j
            if "plazo" in h and "plazo" not in cols:
                cols["plazo"] = j
    out = {"tasa_ahorro": [], "tasa_plazo": []}
    for d, i in _year_month_rows(df):
        for k, code in (("ahorro", "tasa_ahorro"), ("plazo", "tasa_plazo")):
            if k in cols:
                v = num(df.iat[i, cols[k]])
                if v is not None:
                    out[code].append((d, v))
    return {k: dedupe(v) for k, v in out.items()}


def encaje(book) -> dict:
    """1_3_36: coeficiente de encaje ordinario de la banca universal (si no hay, el de depósitos a la vista)."""
    pts = []
    for df in book.values():
        hdr = next((i for i in range(min(15, len(df))) if any("ORDINARIO" in str(x).upper() for x in df.iloc[i].tolist())), None)
        if hdr is None:
            continue
        c_ord = next(j for j in range(df.shape[1]) if "ORDINARIO" in str(df.iat[hdr, j]).upper())
        vista_row = next((i for i in range(hdr, min(hdr + 4, len(df))) if any("VISTA" in str(x).upper() for x in df.iloc[i].tolist())), None)
        c_vis = next((j for j in range(df.shape[1]) if vista_row is not None and "VISTA" in str(df.iat[vista_row, j]).upper()), None)
        for d, i in _year_month_rows(df):
            v = num(df.iat[i, c_ord])
            if v is None and c_vis is not None:
                v = num(df.iat[i, c_vis])
            if v is not None:
                pts.append((d, v))
    return {"encaje_legal": dedupe(pts)}


# ------------------------------------------------------------------ tablas trimestrales (BdP, PIB)
def _quarter_cols(df: pd.DataFrame):
    """Fila de años y fila de trimestres (I..IV) debajo → {col: fecha fin de trimestre}."""
    for i in range(min(15, len(df) - 1)):
        years = {j: year_of(df.iat[i, j]) for j in range(1, df.shape[1]) if year_of(df.iat[i, j])}
        if len(years) < 2:
            continue
        cols, y = {}, None
        for j in range(1, df.shape[1]):
            y = years.get(j, y)
            q = ROMAN.get(str(df.iat[i + 1, j]).strip().upper().replace("TRIM", "").strip())
            if y and q:
                cols[j] = eom(y, q * 3)
        if len(cols) >= 4:
            return cols
    return {}


BOP_ROWS = {
    "cuenta_corriente": r"^Cuenta corriente",
    "exportaciones_bienes": r"^Exportaciones de bienes",
    "importaciones_bienes": r"^Importaciones de bienes",
    "transferencias_corrientes": r"^Transferencias corrientes",
    "inversion_directa_pais": r"^En el pa[ií]s",
}


def balanza_pagos(book) -> dict:
    df = list(book.values())[0]
    cols = _quarter_cols(df)
    out = {}
    for code, rx in BOP_ROWS.items():
        r = find_row(df, rx)
        if r is not None:
            pts = [(d, num(df.iat[r, j])) for j, d in cols.items()]
            if code == "importaciones_bienes":  # la balanza registra importaciones con signo negativo
                pts = [(d, abs(v)) if v is not None else (d, v) for d, v in pts]
            out[code] = dedupe(pts)
    # petroleras / no petroleras de exportaciones (primeras filas tras "Exportaciones de bienes")
    r = find_row(df, r"^Exportaciones de bienes")
    if r is not None:
        for k, code in ((1, "exportaciones_petroleras"), (2, "exportaciones_no_petroleras")):
            out[code] = dedupe([(d, num(df.iat[r + k, j])) for j, d in cols.items()])
    return out


def pib_trimestral(book) -> dict:
    df = list(book.values())[0]
    cols = _quarter_cols(df)
    out = {}
    for code, rx in (("pib_real_var", r"^Consolidado"), ("pib_petrolero_var", r"^Actividad petrolera"), ("pib_no_petrolero_var", r"^Actividad no petrolera")):
        r = find_row(df, rx)
        if r is not None:
            out[code] = dedupe([(d, num(df.iat[r, j])) for j, d in cols.items()])
    return out


def pib_anual(book) -> dict:
    df = list(book.values())[0]
    hdr = find_row(df, r"^Actividades")
    out = {}
    if hdr is None:
        return out
    cols = {j: f"{year_of(df.iat[hdr, j])}-12-31" for j in range(1, df.shape[1]) if year_of(df.iat[hdr, j])}
    for code, rx in (("pib_anual_var", r"^Consolidado"), ("pib_petrolero_anual_var", r"^Actividad petrolera"), ("pib_no_petrolero_anual_var", r"^Actividad no petrolera")):
        r = find_row(df, rx)
        if r is not None:
            out[code] = dedupe([(d, num(df.iat[r, j])) for j, d in cols.items()])
    return out


# ------------------------------------------------------------------ despachador
PARSERS = [
    (r"liquidez_monetaria_semanal", liquidez_semanal),
    (r"base_monetaria_semanal", base_semanal),
    (r"^2_1_1\b", reservas_diarias),
    (r"^2_3_1\b", reservas_mensuales),
    (r"^1_1_7", tasa_activa_semanal),
    (r"^1_1_6", tasas_pasivas_mensual),
    (r"^1_3_36", encaje),
    (r"^2_4_1_t", balanza_pagos),
    (r"^5_2_4_ae_trim", pib_trimestral),
    (r"^5_2_4_ae_anual", pib_anual),
]

# Archivos que el robot busca en la carpeta pública del BCV (además de los que descubre en las páginas)
KNOWN_FILES = ["liquidez_monetaria_semanal.xls", "base_monetaria_semanal.xls", "2_1_1.xlsx", "2_3_1.xlsx", "1_1_7_semanal_nuevo.xlsx", "1_1_6_mensual.xlsx",
               "1_3_36.xls", "2_4_1_t.xls", "5_2_4_ae_trim.xlsx", "5_2_4_ae_anual.xlsx"]


def parser_for(name: str):
    base = re.sub(r"^[0-9a-f]{8}-", "", name.rsplit("/", 1)[-1].lower())
    return next((fn for rx, fn in PARSERS if re.search(rx, base)), None)


def read_book(content: bytes, name: str) -> dict:
    xls = content[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # formato .xls antiguo
    book = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None, engine="xlrd" if xls else "openpyxl")
    # quita columnas y filas vacías (varios archivos dejan la columna A en blanco)
    out = {}
    for name, df in book.items():
        df = df.dropna(how="all").dropna(axis=1, how="all")
        df.columns = range(df.shape[1])
        out[name] = df.reset_index(drop=True)
    return out


def parse_file(name: str, content: bytes) -> dict:
    fn = parser_for(name)
    if not fn:
        return {}
    return {k: v for k, v in fn(read_book(content, name)).items() if v}


def postprocess(series: dict) -> dict:
    """Une reservas mensuales (desde 1996) con las diarias (desde 2016) en una sola serie."""
    if "reservas_internacionales_mensual" in series:
        monthly = series.pop("reservas_internacionales_mensual")
        daily = series.get("reservas_internacionales", [])
        first = daily[0][0] if daily else "9999"
        series["reservas_internacionales"] = sorted([p for p in monthly if p[0] < first] + daily)
    return series
