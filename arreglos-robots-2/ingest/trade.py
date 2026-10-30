"""Comercio exterior por rubro (capítulo HS de 2 dígitos) con datos espejo de UN Comtrade.

Venezuela no reporta a Comtrade desde hace años, así que se reconstruye con lo que declaran
sus socios: importaciones del socio desde Venezuela = exportaciones venezolanas (X);
exportaciones del socio hacia Venezuela = importaciones venezolanas (M).
Sin clave usa el endpoint público (500 filas por consulta). Con COMTRADE_API_KEY usa el completo.
"""
from __future__ import annotations

import datetime as dt
import os
import time
from collections import defaultdict

from .common import Run, fetch, save_obs, upsert

VEN = 862
PARTNERS = {842: "Estados Unidos", 156: "China", 699: "India", 724: "España", 170: "Colombia",
            76: "Brasil", 484: "México", 792: "Turquía", 380: "Italia", 276: "Alemania",
            528: "Países Bajos", 591: "Panamá", 32: "Argentina", 152: "Chile", 124: "Canadá",
            392: "Japón", 218: "Ecuador", 604: "Perú", 780: "Trinidad y Tobago", 251: "Francia",
            643: "Rusia", 410: "Corea del Sur", 344: "Hong Kong", 702: "Singapur"}


def query(reporter: int, year: int, partner_flow: str) -> list[dict]:
    key = os.environ.get("COMTRADE_API_KEY")
    params = {"reporterCode": reporter, "period": year, "partnerCode": VEN, "flowCode": partner_flow,
              "cmdCode": "AG2", "includeDesc": "true"}
    if key:
        url = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
        return fetch(url, params=params, headers={"Ocp-Apim-Subscription-Key": key}).json().get("data") or []
    url = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
    return fetch(url, params=params).json().get("data") or []


def run(backfill: bool = False):
    with Run("trade") as r:
        this_year = dt.date.today().year
        years = range(2014 if backfill else this_year - 3, this_year + 1)
        totals = {"X": defaultdict(float), "M": defaultdict(float)}
        errors = streak = 0
        stop = False
        for year in years:
            if stop:
                break
            for rep, rep_name in PARTNERS.items():
                if stop:
                    break
                # flujo del socio: M (importa desde VEN) => X de Venezuela; X (exporta a VEN) => M de Venezuela
                for partner_flow, ven_flow in (("M", "X"), ("X", "M")):
                    try:
                        data = query(rep, year, partner_flow)
                    except Exception as e:  # noqa: BLE001
                        errors += 1
                        streak += 1
                        r.log.warning("%s %s %s: %s", rep_name, year, partner_flow, e)
                        if streak >= 8:  # límite diario de Comtrade agotado: seguir mañana
                            r.note("Comtrade cortó las consultas (límite diario); se completa en la próxima corrida")
                            stop = True
                            break
                        time.sleep(3)
                        continue
                    streak = 0
                    rows = []
                    for d in data:
                        hs2 = str(d.get("cmdCode") or "")
                        val = d.get("primaryValue")
                        if not hs2 or hs2 == "TOTAL" or val is None:
                            continue
                        rows.append({"year": year, "flow": ven_flow, "partner_code": rep, "partner": rep_name,
                                     "hs2": hs2.zfill(2), "hs2_desc": d.get("cmdDesc"),
                                     "value_usd": float(val), "net_kg": d.get("netWgt")})
                        totals[ven_flow][year] += float(val)
                    r.rows += upsert("trade_flows", rows, "year,flow,partner_code,hs2")
                    time.sleep(1.2)
        # Totales anuales (millones US$), solo años con algún dato
        r.rows += save_obs("exportaciones_espejo",
                           [(f"{y}-12-31", v / 1e6) for y, v in totals["X"].items() if v], "UN Comtrade (espejo)")
        r.rows += save_obs("importaciones_espejo",
                           [(f"{y}-12-31", v / 1e6) for y, v in totals["M"].items() if v], "UN Comtrade (espejo)")
        if errors:
            r.note(f"{errors} consultas Comtrade fallidas (límite de velocidad o año sin datos)")
