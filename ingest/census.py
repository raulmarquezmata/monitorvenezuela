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


def query(path: str, value: str, extra: dict | None = None, since: str = "2015-01") -> list[tuple[str, float]]:
    params = {"get": f"CTY_CODE,{value}", "CTY_CODE": VE, "time": f"from {since}", **(extra or {})}
    rows = fetch(f"{API}/{path}", params=params, timeout=90).json()
    head, out = rows[0], {}
    iv, it = head.index(value), head.index("time")
    for r in rows[1:]:
        try:
            out[eom(r[it])] = out.get(eom(r[it]), 0) + float(r[iv]) / 1e6
        except (TypeError, ValueError):
            continue
    return sorted(out.items())


def run():
    with Run("census") as r:
        for code, path, value, extra in (
            ("eeuu_importa_de_ve", "imports/hs", "GEN_VAL_MO", None),
            ("eeuu_importa_petroleo_ve", "imports/hs", "GEN_VAL_MO", {"I_COMMODITY": "27", "COMM_LVL": "HS2"}),
            ("eeuu_exporta_a_ve", "exports/hs", "ALL_VAL_MO", None),
        ):
            try:
                r.rows += save_obs(code, query(path, value, extra), "US Census Bureau")
            except Exception as e:  # noqa: BLE001
                r.note(f"{code}: {e}")
