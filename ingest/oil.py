"""Petróleo: producción venezolana (EIA, mensual) y precios Brent/WTI (EIA, diario).
Requiere EIA_API_KEY (gratis en https://www.eia.gov/opendata/register.php)."""
from __future__ import annotations

import os

from .common import Run, fetch, save_obs

API = "https://api.eia.gov/v2"


def run(backfill: bool = False):
    with Run("oil") as r:
        key = os.environ.get("EIA_API_KEY")
        if not key:
            r.note("Falta EIA_API_KEY: se omiten producción EIA y Brent/WTI.")
            return
        # Producción de crudo (incluye condensado), miles de b/d
        try:
            j = fetch(f"{API}/international/data/", params={
                "api_key": key, "frequency": "monthly", "data[0]": "value",
                "facets[countryRegionId][]": "VEN", "facets[productId][]": "57",
                "facets[activityId][]": "1", "facets[unit][]": "TBPD",
                "sort[0][column]": "period", "sort[0][direction]": "desc",
                "length": 5000 if backfill else 36}).json()
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
                "length": 5000 if backfill else 60}).json()
            by = {"RBRTE": [], "RWTC": []}
            for d in j["response"]["data"]:
                if d.get("value") not in (None, ""):
                    by.setdefault(d["series"], []).append((d["period"], float(d["value"])))
            r.rows += save_obs("brent", by["RBRTE"], "EIA")
            r.rows += save_obs("wti", by["RWTC"], "EIA")
        except Exception as e:  # noqa: BLE001
            r.note(f"EIA precios: {e}")
