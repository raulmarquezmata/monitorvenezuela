"""Inflación (INPC del BCV): variación mensual, acumulada e interanual.

Fuente: tablas anuales de Finanzas Digital que replican las cifras oficiales del BCV
(https://finanzasdigital.com/inflacion-por-pais/venezuela/<año>/), disponibles desde 1986.
Corre a diario: el dato del mes aparece apenas el BCV lo publica.
"""
from __future__ import annotations

import datetime as dt
import re

from bs4 import BeautifulSoup

from .common import Run, fetch, save_obs, today_caracas, ve_number

URL = "https://finanzasdigital.com/inflacion-por-pais/venezuela/{y}/"
MONTHS = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                       "septiembre", "octubre", "noviembre", "diciembre"], 1)}
FIRST_YEAR = 1986


def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def parse(html: str, year: int) -> dict[str, list]:
    """{'mensual': [(fecha, %)], 'acumulada': [...], 'interanual': [...]}"""
    out = {"mensual": [], "acumulada": [], "interanual": []}
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True).lower() for th in table.find_all("th")]
        if heads and not any("mensual" in h for h in heads):
            continue
        idx = {"mensual": None, "acumulada": None, "interanual": None}
        for i, h in enumerate(heads):
            for k in idx:
                if k in h and idx[k] is None:
                    idx[k] = i
        if idx["mensual"] is None:
            idx = {"mensual": 1, "acumulada": 2, "interanual": 3}
        for tr in table.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            first = cells[0].lower()
            month = next((n for name, n in MONTHS.items() if name in first), None)
            if not month:
                continue
            ym = re.search(r"(19|20)\d\d", first)
            y = int(ym.group(0)) if ym else year
            for k, i in idx.items():
                if i is not None and i < len(cells):
                    v = ve_number(cells[i].replace("+", ""))
                    if v is not None:
                        out[k].append((eom(y, month), v))
        if out["mensual"]:
            break
    return out


def run(backfill: bool = False):
    with Run("inflation") as r:
        this = today_caracas().year
        years = range(FIRST_YEAR, this + 1) if backfill else [this - 1, this] if today_caracas().month <= 2 else [this]
        empty = []
        for y in years:
            try:
                data = parse(fetch(URL.format(y=y), timeout=40, retries=2).text, y)
            except Exception as e:  # noqa: BLE001
                empty.append(f"{y} ({e.__class__.__name__})")
                continue
            if not data["mensual"]:
                empty.append(str(y))
            r.rows += save_obs("inflacion_mensual", data["mensual"], "BCV (vía Finanzas Digital)")
            r.rows += save_obs("inflacion_acumulada", data["acumulada"], "BCV (vía Finanzas Digital)")
            r.rows += save_obs("inflacion_interanual", data["interanual"], "BCV (vía Finanzas Digital)")
        if empty:
            r.note("Sin tabla de inflación para: " + ", ".join(empty[:10]))
