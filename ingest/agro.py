"""Agricultura y ganadería: producción, superficie y rendimiento por rubro (FAOSTAT, anual).
Descarga el archivo masivo normalizado (~33 MB) y filtra Venezuela (código FAO 236)."""
from __future__ import annotations

import io
import zipfile

import pandas as pd

from .common import Run, fetch, upsert

BULK = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip"
ELEMENTS = {5510: "production", 5312: "area", 5412: "yield", 5419: "yield"}
FIRST_YEAR = 2000


def run():
    with Run("agro") as r:
        z = zipfile.ZipFile(io.BytesIO(fetch(BULK, timeout=300).content))
        name = next(n for n in z.namelist() if n.endswith(".csv") and "All_Data" in n)
        rows = []
        with z.open(name) as f:
            for chunk in pd.read_csv(f, chunksize=200_000, encoding="latin-1", low_memory=False):
                c = chunk[(chunk["Area Code"] == 236) & (chunk["Element Code"].isin(ELEMENTS))
                          & (chunk["Year"] >= FIRST_YEAR)]
                for t in c.to_dict("records"):
                    if pd.isna(t["Value"]):
                        continue
                    rows.append({"year": int(t["Year"]), "item_code": int(t["Item Code"]), "item": t["Item"],
                                 "element": ELEMENTS[int(t["Element Code"])], "value": float(t["Value"]),
                                 "unit": t["Unit"]})
        dedup = {(x["year"], x["item_code"], x["element"]): x for x in rows}
        r.rows = upsert("agro_production", dedup.values(), "year,item_code,element")
        if not rows:
            r.note("FAOSTAT: no se encontraron filas de Venezuela (¿cambió el formato?)")
