"""Precios diarios de materias primas (cierre del contrato del primer mes, Yahoo Finance).

El Banco Mundial publica promedios mensuales con ~1 mes de rezago; aquí se completa cada serie con
el precio de cada día, convertido a la misma unidad que usa el Banco Mundial. Donde la referencia
del Banco Mundial es otro mercado (granos en el Golfo de EE.UU.) se usa una serie diaria aparte.
"""
from __future__ import annotations

import datetime as dt

from .common import Run, fetch, save_obs, select

LB_PER_KG = 2.20462
# serie -> (símbolo, factor a la unidad de la serie, ¿misma referencia que el Banco Mundial?)
MAP = {
    "oro": ("GC=F", 1, True),                          # US$/oz
    "plata": ("SI=F", 1, True),                        # US$/oz
    "cobre": ("HG=F", 2204.62, True),                  # US$/lb → US$/t
    "aluminio": ("ALI=F", 1, True),                    # US$/t
    "mineral_hierro": ("TIO=F", 1, True),              # US$/t (62% Fe, China)
    "cafe": ("KC=F", LB_PER_KG / 100, True),           # centavos/lb → US$/kg
    "cacao": ("CC=F", 1 / 1000, True),                 # US$/t → US$/kg
    "azucar": ("SB=F", LB_PER_KG / 100, True),         # centavos/lb → US$/kg
    "henry_hub": ("NG=F", 1, True),                    # US$/MMBtu
    "maiz_cbot": ("ZC=F", 39.368 / 100, False),        # centavos/bushel → US$/t
    "trigo_kc": ("KE=F", 36.7437 / 100, False),
    "soya_cbot": ("ZS=F", 36.7437 / 100, False),
}


def closes(sym: str, rng: str) -> list[tuple[str, float]]:
    j = fetch(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}", params={"range": rng, "interval": "1d"}, timeout=30).json()
    res = j["chart"]["result"][0]
    q = res["indicators"]["quote"][0]["close"]
    return [(dt.datetime.utcfromtimestamp(t).date().isoformat(), c) for t, c in zip(res["timestamp"], q) if c]


def run():
    with Run("futuros") as r:
        for code, (sym, k, same_ref) in MAP.items():
            try:
                have = select("observations", {"select": "date", "series_code": f"eq.{code}", "source": "like.Futuro*", "limit": 1})
                pts = [(d, v * k) for d, v in closes(sym, "1mo" if have else "2y")]
                if same_ref and code != "henry_hub":
                    # solo después del último promedio mensual del Banco Mundial (no se mezclan en el mismo período)
                    wb = select("observations", {"select": "date", "series_code": f"eq.{code}", "source": "eq.Banco Mundial", "order": "date.desc", "limit": 1})
                    if wb:
                        cut = (dt.date.fromisoformat(wb[0]["date"]) + dt.timedelta(days=32)).replace(day=1).isoformat()
                        pts = [p for p in pts if p[0] >= cut]
                r.rows += save_obs(code, pts, f"Futuro 1er mes ({sym}, Yahoo Finance)")
            except Exception as e:  # noqa: BLE001
                r.note(f"{code} ({sym}): {e}")
