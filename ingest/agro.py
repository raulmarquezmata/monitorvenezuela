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


# ---------------------------------------------------------------- USDA (pronósticos al día)
PSD = "https://apps.fas.usda.gov/psdonline/downloads/{}"
PSD_FILES = ["psd_grains_pulses_csv.zip", "psd_coffee_csv.zip", "psd_oilseeds_csv.zip", "psd_sugar_csv.zip", "psd_cotton_csv.zip"]
PSD_ATTR = {"Production": "production", "Area Harvested": "area", "Yield": "yield", "Imports": "imports", "Exports": "exports",
            "Domestic Consumption": "consumption", "Total Distribution": None, "Ending Stocks": "ending_stocks"}
PSD_ES = {"Corn": "Maíz", "Rice, Milled": "Arroz (pilado)", "Sorghum": "Sorgo", "Wheat": "Trigo", "Barley": "Cebada", "Oats": "Avena",
          "Coffee, Green": "Café (verde)", "Sugar, Centrifugal": "Azúcar", "Oilseed, Soybean": "Soya", "Meal, Soybean": "Harina de soya",
          "Oil, Soybean": "Aceite de soya", "Oil, Palm": "Aceite de palma", "Cotton": "Algodón", "Oilseed, Sunflowerseed": "Girasol",
          "Oil, Sunflowerseed": "Aceite de girasol", "Oilseed, Peanut": "Maní"}


def run_usda():
    """USDA PSD: producción, área, importaciones, consumo y existencias de Venezuela por campaña,
    con el pronóstico de la campaña en curso (se revisa cada mes con el informe WASDE)."""
    with Run("agro_usda") as r:
        rows = []
        for f in PSD_FILES:
            try:
                z = zipfile.ZipFile(io.BytesIO(fetch(PSD.format(f), timeout=180).content))
            except Exception as e:  # noqa: BLE001
                r.note(f"{f}: {e}")
                continue
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(name) as fh:
                df = pd.read_csv(fh, low_memory=False)
            df = df[(df["Country_Code"] == "VE") & (df["Market_Year"] >= 1990)]
            for t in df.to_dict("records"):
                el = PSD_ATTR.get(str(t["Attribute_Description"]).strip())
                if not el or pd.isna(t["Value"]):
                    continue
                desc = str(t["Commodity_Description"]).strip()
                rows.append({"year": int(t["Market_Year"]), "item_code": 900000 + int(t["Commodity_Code"]) % 100000,
                             "item": f"USDA · {PSD_ES.get(desc, desc)}", "element": el, "value": float(t["Value"]),
                             "unit": str(t["Unit_Description"]).strip()})
        r.rows = upsert("agro_production", list({(x["year"], x["item_code"], x["element"]): x for x in rows}.values()), "year,item_code,element")
        if not rows:
            r.note("USDA PSD sin datos de Venezuela")
