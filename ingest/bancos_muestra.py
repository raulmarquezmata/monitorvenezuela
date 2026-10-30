"""Muestra de bancos (data/bancos/Bancos.xlsx, hoja 'Datos'): depósitos, créditos, resultado neto,
depósitos en divisas, margen de intermediación, patrimonio y valoración de mercado por banco y mes.

Columnas: Año | Mes | Semestre | (banco) | Indicador | Valor Bs | TC | Valor USD
- 'Valor USD' está en millones de US$ (es la referencia).
- Cuando TC = 1 (meses viejos cargados ya en dólares) el monto en Bs se calcula con el oficial del mes.
Se guarda en bank_ranking con métricas 'muestra_<indicador>_usd' y 'muestra_<indicador>_bs' (millones).
Para actualizar: reemplaza el archivo en GitHub; el robot corre solo al subirlo.
"""
from __future__ import annotations

import pathlib
import re
import unicodedata

from .common import Run, select, upsert

FILE = pathlib.Path(__file__).resolve().parent.parent / "data" / "bancos" / "Bancos.xlsx"


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def run():
    import pandas as pd
    with Run("bancos_muestra") as r:
        if not FILE.exists():
            r.note("No está data/bancos/Bancos.xlsx")
            return
        df = pd.read_excel(FILE, sheet_name="Datos")
        bank_col = df.columns[3]  # la columna del banco no tiene título
        bcv = {x["date"][:7]: x["value"] for x in select("observations", {"select": "date,value", "series_code": "eq.usd_bcv", "date": "gte.2023-12-01", "order": "date"})}
        rows = []
        for _, x in df.iterrows():
            mes, bank, ind = x.get("Mes"), x.get(bank_col), x.get("Indicador")
            if pd.isna(mes) or pd.isna(bank) or pd.isna(ind):
                continue
            usd = x.get("Valor USD")
            if pd.isna(usd) or float(usd) == 0:   # 0 = mes sin dato (p. ej. may-2025)
                continue
            period = pd.Timestamp(mes).date().replace(day=1).isoformat()
            tc = x.get("TC")
            bs = float(x["Valor Bs"]) / 1e6 if (not pd.isna(tc) and float(tc) > 1) else (float(usd) * bcv[period[:7]] if period[:7] in bcv else None)
            m = f"muestra_{slug(ind)}"
            rows.append({"period": period, "bank": str(bank).strip(), "metric": f"{m}_usd", "value": float(usd), "share": None})
            if bs is not None:
                rows.append({"period": period, "bank": str(bank).strip(), "metric": f"{m}_bs", "value": bs, "share": None})
        r.rows = upsert("bank_ranking", list({(x["period"], x["bank"], x["metric"]): x for x in rows}.values()), "period,bank,metric")
