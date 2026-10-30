"""Petróleo: producción venezolana (EIA, mensual) y precios Brent/WTI (EIA, diario).
Requiere EIA_API_KEY (gratis en https://www.eia.gov/opendata/register.php)."""
from __future__ import annotations

import os

from .common import Run, fetch, save_obs, select

API = "https://api.eia.gov/v2"


def run(backfill: bool = False):
    with Run("oil") as r:
        key = os.environ.get("EIA_API_KEY")
        if not key:
            r.note("Falta EIA_API_KEY: se omiten producción EIA y Brent/WTI.")
            return
        have = lambda c: len(select("observations", {"select": "date", "series_code": f"eq.{c}"}))
        full_prod = backfill or have("petroleo_prod_eia") < 300   # primera vez: toda la serie (desde 1973)
        full_px = backfill or have("brent") < 2000                 # primera vez: Brent desde 1987, WTI desde 1986
        # Producción de crudo (incluye condensado), miles de b/d
        try:
            j = fetch(f"{API}/international/data/", params={
                "api_key": key, "frequency": "monthly", "data[0]": "value",
                "facets[countryRegionId][]": "VEN", "facets[productId][]": "57",
                "facets[activityId][]": "1", "facets[unit][]": "TBPD",
                "sort[0][column]": "period", "sort[0][direction]": "desc",
                "length": 5000 if full_prod else 36}).json()
            pts = [(f"{d['period']}-01", float(d["value"])) for d in j["response"]["data"]
                   if d.get("value") not in (None, "", "NA", "--")]
            r.rows += save_obs("petroleo_prod_eia", pts, "EIA")
            if not pts:
                r.note("EIA producción: respuesta sin datos (revisar facets)")
        except Exception as e:  # noqa: BLE001
            r.note(f"EIA producción: {e}")
        # Brent y WTI spot
        try:
            j = fetch(f"{API}/petroleum/pri/spt/data/", params={
                "api_key": key, "frequency": "daily", "data[0]": "value",
                "facets[series][]": ["RBRTE", "RWTC"],
                "sort[0][column]": "period", "sort[0][direction]": "desc",
                "length": 5000 if full_px else 60}).json()
            by = {"RBRTE": [], "RWTC": []}
            for d in j["response"]["data"]:
                if d.get("value") not in (None, ""):
                    by.setdefault(d["series"], []).append((d["period"], float(d["value"])))
            if full_px:  # la API devuelve como máximo 5000 filas por llamada: se pide por tramos
                for off in range(5000, 40000, 5000):
                    j2 = fetch(f"{API}/petroleum/pri/spt/data/", params={
                        "api_key": key, "frequency": "daily", "data[0]": "value", "facets[series][]": ["RBRTE", "RWTC"],
                        "sort[0][column]": "period", "sort[0][direction]": "desc", "length": 5000, "offset": off}).json()
                    rows = j2["response"]["data"]
                    for d in rows:
                        if d.get("value") not in (None, ""):
                            by.setdefault(d["series"], []).append((d["period"], float(d["value"])))
                    if len(rows) < 5000:
                        break
            r.rows += save_obs("brent", by["RBRTE"], "EIA")
            r.rows += save_obs("wti", by["RWTC"], "EIA")
        except Exception as e:  # noqa: BLE001
            r.note(f"EIA precios: {e}")
        # La EIA publica con ~1 semana de rezago: los días más recientes se completan con el futuro
        # del primer mes (cierre diario, Yahoo Finance) y se reemplazan cuando la EIA publica el spot.
        for code, sym in (("brent", "BZ=F"), ("wti", "CL=F")):
            try:
                last_eia = select("observations", {"select": "date", "series_code": f"eq.{code}", "source": "eq.EIA",
                                                   "order": "date.desc", "limit": 1})
                cut = last_eia[0]["date"] if last_eia else "1900-01-01"
                j = fetch(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", params={"range": "1mo", "interval": "1d"}).json()
                res = j["chart"]["result"][0]
                import datetime as _dt
                closes = res["indicators"]["quote"][0]["close"]
                pts = [(_dt.datetime.utcfromtimestamp(t).date().isoformat(), c) for t, c in zip(res["timestamp"], closes) if c]
                r.rows += save_obs(code, [p for p in pts if p[0] > cut], "Futuro 1er mes (Yahoo Finance)")
            except Exception as e:  # noqa: BLE001
                r.log.info("Yahoo %s: %s", sym, e)
