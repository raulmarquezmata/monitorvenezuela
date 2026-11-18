"""Bonos de la República (VENZ) y PDVSA.

Entradas (en data/bonos/):
- bloomberg.xlsx  → plantilla con fórmulas BDP/BDH. Se abre en el terminal Bloomberg, se guarda y
                    se sube a GitHub. Hoja "Historico": pares de columnas (fecha, PX_LAST) por bono.
                    Hoja "Precios": último precio del día (columna LAST_UPDATE_DT como fecha).
- cierres.csv     → cierres puntuales (ticker,date,price,source), p. ej. desde una captura.
- Börse Frankfurt (automático) → cierre diario y último precio del día de 22 de los 24 bonos (por ISIN), vía la
                    misma API que usa live.deutsche-boerse.com. Corre con los robots frecuentes en horario de Frankfurt.
                    Validado contra Bloomberg el 28-oct-2026: Frankfurt queda 0–4 puntos por debajo (cotiza cerca del
                    precio comprador). Donde hay precio de Bloomberg para la misma fecha, manda Bloomberg.
Salidas: tablas bonds / bond_prices y series promedio VENZ y PDVSA (en % del valor nominal).
"""
from __future__ import annotations

import csv
import datetime as dt
import pathlib
import re
from collections import defaultdict

from .common import Run, save_obs, upsert

DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "bonos"
FRACTIONS = {"1/8": .125, "1/4": .25, "3/8": .375, "1/2": .5, "5/8": .625, "3/4": .75, "7/8": .875}


def meta(ticker: str) -> dict:
    """'VENZ 9 1/4 09/15/27' → emisor, cupón 9,25, vencimiento 2027-09-15."""
    t = re.sub(r"\s+(Corp|Govt)$", "", ticker.strip(), flags=re.I)
    m = re.match(r"(VENZ|PDVSA)\s+([\d.]+)(?:\s+(\d/\d))?\s+(\d{2})/(\d{2})/(\d{2})", t)
    if not m:
        return {"ticker": t, "issuer": t.split()[0], "coupon": None, "maturity": None, "name": t}
    cpn = float(m.group(2)) + FRACTIONS.get(m.group(3) or "", 0)
    mat = dt.date(2000 + int(m.group(6)), int(m.group(4)), int(m.group(5)))
    issuer = "República" if m.group(1) == "VENZ" else "PDVSA"
    return {"ticker": t, "issuer": m.group(1), "coupon": cpn, "maturity": mat.isoformat(),
            "name": f"{issuer} {cpn:g}% {mat.year}".replace(".", ",") + (" (2)" if "(2)" in t else "")}


def read_csv() -> list[tuple]:
    p = DIR / "cierres.csv"
    if not p.exists():
        return []
    with p.open(encoding="utf-8-sig") as f:
        return [(r["ticker"].strip(), r["date"].strip(), float(r["price"]), (r.get("source") or "Carga").strip())
                for r in csv.DictReader(f) if r.get("price")]


def read_xlsx() -> list[tuple]:
    p = DIR / "bloomberg.xlsx"
    if not p.exists():
        return []
    import openpyxl  # type: ignore
    wb = openpyxl.load_workbook(p, data_only=True)
    out = []
    if "Historico" in wb.sheetnames:
        ws = wb["Historico"]
        for col in range(1, ws.max_column + 1, 2):
            ticker = ws.cell(1, col).value
            if not ticker:
                continue
            for row in range(2, ws.max_row + 1):
                d, v = ws.cell(row, col).value, ws.cell(row, col + 1).value
                if isinstance(d, (dt.date, dt.datetime)) and isinstance(v, (int, float)):
                    out.append((str(ticker), d.isoformat()[:10], float(v), "Bloomberg"))
    if "Precios" in wb.sheetnames:
        ws = wb["Precios"]
        for row in ws.iter_rows(min_row=2, values_only=True):
            ticker, _name, last = row[0], row[1], row[2]
            upd = row[6] if len(row) > 6 else None
            if ticker and isinstance(last, (int, float)):
                d = upd.isoformat()[:10] if isinstance(upd, (dt.date, dt.datetime)) else dt.date.today().isoformat()
                out.append((str(ticker), d, float(last), "Bloomberg"))
    return out


# ISIN de cada bono en la Bolsa de Frankfurt (VENZ 11 3/4 2026 y PDVSA 6 2026 no cotizan allí)
FRA = {
    "VENZ 13 5/8 08/15/18": "US922646AT10", "VENZ 13 5/8 08/15/18 (2)": "USP9395PAA95", "VENZ 7 12/01/18": "USP97475AD26",
    "VENZ 7 3/4 10/13/19": "USP97475AN08", "VENZ 6 12/09/20": "USP97475AG56", "VENZ 12 3/4 08/23/22": "USP17625AC16",
    "VENZ 9 05/07/23": "USP17625AA59", "VENZ 8 1/4 10/13/24": "USP97475AP55", "VENZ 7.65 04/21/25": "XS0217249126",
    "VENZ 9 1/4 09/15/27": "US922646AS37", "VENZ 9 1/4 05/07/28": "USP17625AB33", "VENZ 11.95 08/05/31": "USP17625AD98",
    "VENZ 9 3/8 01/13/34": "US922646BL74", "VENZ 7 03/31/38": "USP97475AJ95",
    "PDVSA 8 1/2 10/27/20": "USP7807HAV70", "PDVSA 9 11/17/21": "USP7807HAP03", "PDVSA 6 10/28/22": "XS1126891685",
    "PDVSA 12 3/4 02/17/22": "USP7807HAM71", "PDVSA 6 05/16/24": "USP7807HAT25", "PDVSA 5 3/8 04/12/27": "XS0294364954",
    "PDVSA 9 3/4 05/17/35": "USP7807HAQ85", "PDVSA 5 1/2 04/12/37": "XS0294367205",
}
FRA_API = "https://api.live.deutsche-boerse.com/v1"
FRA_HDR = {"Origin": "https://live.deutsche-boerse.com", "Referer": "https://live.deutsche-boerse.com/", "Accept": "application/json"}
FRA_SRC = "Börse Frankfurt"


def frankfurt(days: int) -> list[tuple]:
    """[(ticker, fecha, precio, fuente)]: cierres de los últimos `days` días + último precio de hoy."""
    from .common import http
    now = dt.datetime.now(dt.timezone.utc)
    t0, t1 = int((now - dt.timedelta(days=days)).timestamp()), int(now.timestamp())
    out = []
    for ticker, isin in FRA.items():
        try:
            j = http.get(f"{FRA_API}/tradingview/history", params={"symbol": f"XFRA:{isin}", "resolution": "D", "from": t0, "to": t1},
                         headers=FRA_HDR, timeout=30).json()
            for t, c in zip(j.get("t") or [], j.get("c") or []):
                if c:
                    out.append((ticker, dt.datetime.fromtimestamp(t, dt.timezone.utc).date().isoformat(), float(c), FRA_SRC))
            q = http.get(f"{FRA_API}/data/quote_box/single", params={"isin": isin, "mic": "XFRA"}, headers=FRA_HDR, timeout=30).json()
            ts = (q.get("timestampLastPrice") or q.get("timestamp") or "")[:10]
            if q.get("lastPrice") and ts:
                out.append((ticker, ts, float(q["lastPrice"]), FRA_SRC))
        except Exception:  # noqa: BLE001
            continue
    return out


def run_frankfurt(force: bool = False):
    """Robot frecuente: precios de Frankfurt (lunes a viernes, 7:00–17:30 UTC = horario de la bolsa).
    Historia completa desde enero de 2025 la primera vez; luego, los últimos 10 días."""
    from .common import select
    with Run("bonos_frankfurt") as r:
        now = dt.datetime.now(dt.timezone.utc)
        if not force and (now.weekday() > 4 or not (7 <= now.hour < 18)):
            r.log.info("Fuera del horario de Frankfurt")
            return
        # historia completa si falta el cierre de fin de año (base del «en el año»), si no, últimos 10 días
        have = select("bond_prices", {"select": "date", "source": f"eq.{FRA_SRC}",
                                      "and": f"(date.gte.{now.year - 1}-12-20,date.lte.{now.year - 1}-12-31)", "limit": 1})
        # …o si quedan precios de la captura puntual de Bloomberg en bonos que cotizan en Frankfurt (se reemplazan una vez)
        tick = ",".join('"' + meta(t)["ticker"] + '"' for t in FRA)
        cap = select("bond_prices", {"select": "date", "source": "like.Bloomberg (captura*", "ticker": f"in.({tick})", "limit": 1})
        days = 10 if (have and not cap) else (now.date() - dt.date(2025, 1, 1)).days
        rows = frankfurt(days)
        if not rows:
            r.note("Frankfurt no devolvió precios")
            return
        # Bloomberg (archivo bloomberg.xlsx) manda en las fechas donde ya hay precio suyo. La captura puntual del 28-oct
        # («Bloomberg (captura…)») se reemplaza por Frankfurt, para que %día, %semana y %año comparen la misma fuente.
        since = (now.date() - dt.timedelta(days=days)).isoformat()
        bbg = {(x["ticker"], x["date"]) for x in select("bond_prices", {"select": "ticker,date", "date": f"gte.{since}", "source": "eq.Bloomberg"})}
        prices = {(t, d): {"ticker": meta(t)["ticker"], "date": d, "price": v, "source": src} for t, d, v, src in rows if (t, d) not in bbg}
        upsert("bonds", [dict(meta(t)) for t in FRA], "ticker")
        r.rows += upsert("bond_prices", list(prices.values()), "ticker,date")
        by = defaultdict(lambda: defaultdict(list))
        for (t, d), p in prices.items():
            by[meta(t)["issuer"]][d].append(p["price"])
        for issuer, code in (("VENZ", "deuda_venz_prom"), ("PDVSA", "deuda_pdvsa_prom")):
            n = len([t for t in FRA if meta(t)["issuer"] == issuer])
            pts = [(d, sum(v) / len(v)) for d, v in by[issuer].items() if len(v) >= max(1, n // 2)]
            r.rows += save_obs(code, sorted(pts), "Börse Frankfurt · promedio simple")
        if cap and len(prices) > 1000:
            # quedan puntos de la captura (estimados a partir de %1D/%semana/%año) en fechas sin cotización de Frankfurt:
            # se quitan para no mezclar fuentes en la misma serie (los dos bonos que no cotizan en Frankfurt los conservan)
            from .common import delete
            delete("bond_prices", {"source": "like.Bloomberg (captura*", "ticker": f"in.({tick})"})
        r.log.info("Frankfurt: %d precios (%d días)", len(prices), days)


def run():
    with Run("bonds") as r:
        rows = read_csv() + read_xlsx()  # el Excel de Bloomberg, al ir después, prevalece
        if not rows:
            r.note("Sin archivos en data/bonos/")
            return
        prices: dict[tuple, dict] = {}
        for ticker, d, v, src in rows:
            t = meta(ticker)["ticker"]
            prices[(t, d)] = {"ticker": t, "date": d, "price": v, "source": src}
        tickers = sorted({k[0] for k in prices})
        upsert("bonds", [dict(meta(t), sort=i) for i, t in enumerate(tickers)], "ticker")
        r.rows += upsert("bond_prices", list(prices.values()), "ticker,date")
        # promedio simple por emisor y fecha (solo fechas con al menos la mitad de los bonos)
        by = defaultdict(lambda: defaultdict(list))
        for (t, d), p in prices.items():
            by[meta(t)["issuer"]][d].append(p["price"])
        for issuer, code in (("VENZ", "deuda_venz_prom"), ("PDVSA", "deuda_pdvsa_prom")):
            n = len([t for t in tickers if meta(t)["issuer"] == issuer])
            pts = [(d, sum(v) / len(v)) for d, v in by[issuer].items() if len(v) >= max(1, n // 2)]
            r.rows += save_obs(code, sorted(pts), "Bloomberg · promedio simple")
