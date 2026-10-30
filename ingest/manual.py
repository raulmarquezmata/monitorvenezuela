"""Carga de series manuales: data/manual/<codigo_serie>.csv con columnas date,value[,source].

Para series sin fuente automática confiable (OPEP MOMR, SUDEBAN, encaje, PIB, Merey...).
Se editan directamente en GitHub (botón ✏️) y el robot las sube a Supabase al guardar.
"""
from __future__ import annotations

import csv
import pathlib

from .catalog import SERIES
from .common import Run, save_obs, select, ve_number

DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "manual"
HIST = pathlib.Path(__file__).resolve().parent.parent / "data" / "historico"
CODES = {s["code"] for s in SERIES}
OVERRIDABLE = ("Yadio (histórico)", "BCV (vía DolarApi)")


def run():
    with Run("manual") as r:
        for path in sorted(DIR.glob("*.csv")) + sorted(HIST.glob("*.csv")):
            code = path.stem
            if code not in CODES:
                r.note(f"{path.name}: la serie '{code}' no existe en ingest/catalog.py")
                continue
            pts, src = [], "Carga manual"
            with path.open(encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    d, v = (row.get("date") or "").strip(), ve_number(row.get("value"))
                    if d and v is not None:
                        pts.append((d, v))
                        src = (row.get("source") or src).strip() or src
            if path.parent == HIST:
                # la historia sembrada rellena lo que el robot del BCV no tiene: antes de su primer dato y después
                # del último (p. ej. el último trimestre si el Excel que publica el BCV está atrasado), sin
                # intercalar fechas en medio para no mezclar semanas con fechas distintas
                live = [x["date"] for x in select("observations", {"select": "date", "series_code": f"eq.{code}", "source": "eq.BCV", "order": "date"})]
                if live:
                    pts = [p for p in pts if p[0] < live[0] or p[0] > live[-1]]
                # y nunca pisa fechas que ya tienen dato de otra fuente (salvo los respaldos de menor calidad)
                taken = {x["date"] for x in select("observations", {"select": "date,source", "series_code": f"eq.{code}"})
                         if x.get("source") not in (src, *OVERRIDABLE)}
                pts = [p for p in pts if p[0] not in taken]
            n = save_obs(code, pts, src)
            r.rows += n
            if n and code in ("usd_paralelo", "usd_bcv"):
                from .fx import gap_from_db
                r.rows += gap_from_db(2000)


def bank_derived() -> int:
    """Intermediación crediticia y conversión a US$ de cartera y depósitos (si hay datos manuales)."""
    from .common import select

    get = lambda c: {x["date"]: x["value"] for x in select("observations", {
        "select": "date,value", "series_code": f"eq.{c}", "order": "date"})}
    cred, dep = get("cartera_credito"), get("depositos_totales")
    n = 0
    if cred and dep:
        n += save_obs("intermediacion", [(d, cred[d] / dep[d] * 100) for d in cred if dep.get(d)], "Cálculo propio")
    return n
