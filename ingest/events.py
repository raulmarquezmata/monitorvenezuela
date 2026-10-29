"""Línea de tiempo: eventos curados (config/timeline.json) + eventos automáticos generados de los datos.

Automáticos (año en curso):
- cada dato de inflación mensual publicado,
- cada informe OPEP (producción de Venezuela por fuentes secundarias),
- cada mes de intervención cambiaria,
- cada acción de OFAC relacionada con Venezuela.
"""
from __future__ import annotations

import json
import pathlib

from .common import Run, select, today_caracas, upsert

CONFIG = pathlib.Path(__file__).resolve().parent.parent / "config" / "timeline.json"
MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def fmt(v: float, dec: int = 2) -> str:
    return f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def obs(code: str, since: str) -> list[dict]:
    return select("observations", {"select": "date,value,source", "series_code": f"eq.{code}", "date": f"gte.{since}", "order": "date"})


def auto_events(year: int) -> list[dict]:
    since = f"{year - 1}-12-01"
    out = []
    for o in obs("inflacion_mensual", f"{year}-01-01"):
        m = int(o["date"][5:7])
        out.append({"id": f"auto-inflacion-{o['date'][:7]}", "date": o["date"], "precision": "month", "category": "precios", "importance": 2,
                    "title_es": f"Inflación de {MES[m - 1]}: {fmt(o['value'])}%", "title_en": f"{MON_EN[m - 1]} inflation: {o['value']:.2f}%",
                    "series_code": "inflacion_mensual", "origin": "automatico"})
    for o in obs("petroleo_prod_opep_fs", since):
        m = int(o["date"][5:7])
        out.append({"id": f"auto-opep-{o['date'][:7]}", "date": o["date"], "precision": "month", "category": "petroleo", "importance": 3,
                    "title_es": f"OPEP (fuentes secundarias): Venezuela produjo {fmt(o['value'], 0)} mil b/d en {MES[m - 1]}",
                    "title_en": f"OPEC (secondary sources): Venezuela produced {o['value']:,.0f} kb/d in {MON_EN[m - 1]}",
                    "series_code": "petroleo_prod_opep_fs", "origin": "automatico"})
    for o in obs("intervencion_bcv_mensual", f"{year}-01-01"):
        m = int(o["date"][5:7])
        out.append({"id": f"auto-intervencion-{o['date'][:7]}", "date": o["date"], "precision": "month", "category": "cambiario", "importance": 3,
                    "title_es": f"Intervención cambiaria de {MES[m - 1]}: US$ {fmt(o['value'], 0)} millones",
                    "title_en": f"{MON_EN[m - 1]} FX intervention: US$ {o['value']:,.0f} million",
                    "series_code": "intervencion_bcv_mensual", "origin": "automatico"})
    for a in select("ofac_actions", {"select": "url,date,title", "date": f"gte.{year}-01-01"}):
        out.append({"id": f"auto-ofac-{a['url'].rsplit('/', 1)[-1]}", "date": a["date"], "precision": "day", "category": "sanciones", "importance": 2,
                    "title_es": f"OFAC: {a['title']}", "title_en": f"OFAC: {a['title']}", "url": a["url"], "origin": "automatico"})
    return out


def run():
    with Run("events") as r:
        keys = ["id", "date", "precision", "category", "importance", "title_es", "title_en", "body_es", "series_code", "url", "origin"]
        cur = json.loads(CONFIG.read_text(encoding="utf-8"))["eventos"]
        rows = [{k: e.get(k) for k in keys} | {"origin": "curado"} for e in cur]
        rows += [{k: e.get(k) for k in keys} for e in auto_events(today_caracas().year)]
        r.rows = upsert("events", rows, "id")
