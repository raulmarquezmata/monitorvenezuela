"""Materias primas relevantes para Venezuela: Banco Mundial 'Pink Sheet' (precios mensuales).

Busca el enlace vigente a CMO-Historical-Data-Monthly.xlsx en la página de mercados de materias
primas (cambia cada año) y usa un enlace conocido como respaldo.
"""
from __future__ import annotations

import io
import re

import pandas as pd

from .common import Run, fetch, save_obs

PAGE = "https://www.worldbank.org/en/research/commodity-markets"
FALLBACK = ("https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/"
            "related/CMO-Historical-Data-Monthly.xlsx")

# serie -> patrón del encabezado en la hoja "Monthly Prices"
COLUMNS = {
    "oro": r"^gold", "mineral_hierro": r"^iron ore", "aluminio": r"^aluminum", "maiz": r"^maize",
    "trigo": r"^wheat, us hrw", "arroz": r"^rice, thai 5", "cafe": r"^coffee, arabica", "cacao": r"^cocoa",
    "azucar": r"^sugar, world", "soya": r"^soybeans$", "urea": r"^urea", "dap": r"^dap",
    "henry_hub": r"^natural gas, us",
}


def find_url() -> str:
    try:
        html = fetch(PAGE, timeout=40).text
        m = re.search(r'https?://[^"\']+CMO-Historical-Data-Monthly\.xlsx', html)
        if m:
            return m.group(0)
    except Exception:  # noqa: BLE001
        pass
    return FALLBACK


def parse(content: bytes) -> dict[str, list]:
    df = pd.read_excel(io.BytesIO(content), sheet_name="Monthly Prices", header=None, engine="openpyxl")
    # fila de encabezados: la que contiene "Crude oil" y "Gold"
    hdr = next(i for i in range(15) if any(str(x).lower().startswith("gold") for x in df.iloc[i].tolist()))
    headers = [str(x).strip().lower() for x in df.iloc[hdr].tolist()]
    out: dict[str, list] = {}
    for code, rx in COLUMNS.items():
        col = next((j for j, h in enumerate(headers) if re.search(rx, h)), None)
        if col is None:
            continue
        pts = []
        for _, row in df.iloc[hdr + 1:].iterrows():
            m = re.match(r"(\d{4})M(\d{2})", str(row.iloc[0]))
            v = pd.to_numeric(row.iloc[col], errors="coerce")
            if m and pd.notna(v) and int(m.group(1)) >= 1960:
                y, mo = int(m.group(1)), int(m.group(2))
                pts.append((f"{y}-{mo:02d}-01", float(v)))
        out[code] = pts
    return out


def run():
    with Run("commodities") as r:
        url = find_url()
        data = parse(fetch(url, timeout=120).content)
        missing = [c for c in COLUMNS if not data.get(c)]
        for code, pts in data.items():
            r.rows += save_obs(code, pts, "Banco Mundial (Pink Sheet)")
        if missing:
            r.note(f"Columnas no encontradas: {', '.join(missing)}")
