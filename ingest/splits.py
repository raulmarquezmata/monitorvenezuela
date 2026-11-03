"""Ajuste de precios por splits y reverse splits (misma regla que lib/splits.ts de la web).

Un salto de precio de 4 veces o más que el IBC no explica se toma como un cambio en el capital; los precios
anteriores se multiplican por ese factor para que la serie quede en las acciones de hoy.
config/bvc_ajustes.json permite fijar ajustes a mano ('ajustes') o descartar detecciones ('ignorar')."""
from __future__ import annotations

import json
import math
import pathlib

CFG = pathlib.Path(__file__).resolve().parent.parent / "config" / "bvc_ajustes.json"
NICE = [2, 3, 4, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 1e4, 1e5, 1e6]


def _cfg() -> dict:
    try:
        return json.loads(CFG.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _at(pts: list[tuple[str, float]], d: str) -> float | None:
    v = None
    for x, y in pts:
        if x <= d:
            v = y
        else:
            break
    return v


def events(symbol: str, prices: list[tuple[str, float]], ibc: list[tuple[str, float]]) -> list[dict]:
    cfg = _cfg()
    manual = [{"date": a["fecha"], "factor": float(a["factor"]), "manual": True} for a in (cfg.get("ajustes") or {}).get(symbol, [])]
    ignore = set((cfg.get("ignorar") or {}).get(symbol, []))
    out = list(manual)
    for (d0, p0), (d, p) in zip(prices, prices[1:]):
        if not p or not p0 or d in ignore or any(m["date"] == d for m in manual):
            continue
        i1, i0 = _at(ibc, d), _at(ibc, d0)
        rr = (p / p0) / (i1 / i0 if i1 and i0 else 1)
        if 0.25 < rr < 4:
            continue
        big = rr if rr >= 1 else 1 / rr
        nice = min(NICE, key=lambda n: abs(math.log(n / big)))
        k = nice if abs(math.log(nice / big)) < math.log(1.25) else big
        out.append({"date": d, "factor": k if rr >= 1 else 1 / k, "manual": False})
    return sorted(out, key=lambda e: e["date"])


def adjust(prices: list[tuple[str, float]], evs: list[dict]) -> list[tuple[str, float]]:
    if not evs:
        return prices
    out = []
    for d, v in prices:
        k = 1.0
        for e in evs:
            if d < e["date"]:
                k *= e["factor"]
        out.append((d, v * k))
    return out


def label(e: dict, lang: str = "es") -> str:
    f = e["factor"] if e["factor"] >= 1 else 1 / e["factor"]
    n = f"{f:,.0f}".replace(",", ".") if f >= 10 else f"{f:.2f}".rstrip("0").rstrip(".").replace(".", "," if lang == "es" else ".")
    if e["factor"] >= 1:
        return f"reverse split {n}:1" if lang == "es" else f"{n}-for-1 reverse split"
    return f"split 1:{n}" if lang == "es" else f"1-for-{n} split"
