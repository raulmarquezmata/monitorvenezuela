"""Comercio de EE.UU. con Venezuela, mensual (Census Bureau, API pública, sin clave).

EE.UU. es hoy el principal destino del crudo venezolano y publica cada mes con ~5 semanas de rezago,
así que sirve para ver 2026 casi al día mientras la balanza de pagos del BCV va por trimestres.
- eeuu_importa_de_ve        : importaciones de EE.UU. desde Venezuela (= exportaciones venezolanas a EE.UU.)
- eeuu_importa_petroleo_ve  : la parte de capítulo 27 (petróleo y derivados)
- eeuu_exporta_a_ve         : exportaciones de EE.UU. a Venezuela (= importaciones venezolanas desde EE.UU.)
Millones de US$. Código de país de Venezuela en el Census: 3070.
"""
from __future__ import annotations

from .common import Run, fetch, save_obs

API = "https://api.census.gov/data/timeseries/intltrade"
VE = "3070"


def eom(ym: str) -> str:
    import calendar
    y, m = map(int, ym.split("-"))
    return f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


def query(path: str, value: str, comm: str, since: str = "2015-01") -> dict[str, dict[str, float]]:
    """{mes: {capítulo HS2: millones US$}} — se pide por capítulo (COMM_LVL=HS2) y el total es la suma."""
    params = {"get": f"CTY_CODE,{value},{comm}", "CTY_CODE": VE, "COMM_LVL": "HS2", "time": f"from {since}"}
    rows = fetch(f"{API}/{path}", params=params, timeout=120).json()
    head = rows[0]
    iv, it, ic = head.index(value), head.index("time"), head.index(comm)
    out: dict[str, dict[str, float]] = {}
    for r in rows[1:]:
        try:
            out.setdefault(eom(r[it]), {})[str(r[ic])] = out.get(eom(r[it]), {}).get(str(r[ic]), 0) + float(r[iv]) / 1e6
        except (TypeError, ValueError):
            continue
    return out


def run():
    with Run("census") as r:
        try:
            imp = query("imports/hs", "GEN_VAL_MO", "I_COMMODITY")
            r.rows += save_obs("eeuu_importa_de_ve", [(d, sum(v.values())) for d, v in sorted(imp.items())], "US Census Bureau")
            r.rows += save_obs("eeuu_importa_petroleo_ve", [(d, v.get("27", 0)) for d, v in sorted(imp.items())], "US Census Bureau")
        except Exception as e:  # noqa: BLE001
            r.note(f"Census importaciones: {e}")
        try:
            exp = query("exports/hs", "ALL_VAL_MO", "E_COMMODITY")
            r.rows += save_obs("eeuu_exporta_a_ve", [(d, sum(v.values())) for d, v in sorted(exp.items())], "US Census Bureau")
        except Exception as e:  # noqa: BLE001
            r.note(f"Census exportaciones: {e}")
