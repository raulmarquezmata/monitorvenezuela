"""Bonos de la República (VENZ) y PDVSA.

Entradas (en data/bonos/):
- bloomberg.xlsx  → plantilla con fórmulas BDP/BDH. Se abre en el terminal Bloomberg, se guarda y
                    se sube a GitHub. Hoja "Historico": pares de columnas (fecha, PX_LAST) por bono.
                    Hoja "Precios": último precio del día (columna LAST_UPDATE_DT como fecha).
- cierres.csv     → cierres puntuales (ticker,date,price,source), p. ej. desde una captura.
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
