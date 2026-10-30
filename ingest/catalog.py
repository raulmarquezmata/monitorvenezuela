"""Catálogo de series: fuente única de verdad de nombres, unidades, fuentes y PLAN DE ACTUALIZACIÓN.

Para añadir una serie: agrégala en _S y su plan en PLAN. Si es manual, crea data/manual/<code>.csv
(columnas date,value,source). La página "Fuentes y actualización" se construye desde aquí.
"""
from .common import Run, upsert

BCV = "https://www.bcv.org.ve"
EIA = "https://www.eia.gov/opendata/"
WB = "https://www.worldbank.org/en/research/commodity-markets"
OPEP = "https://www.opec.org/opec_web/en/publications/338.htm"
OWN = "Cálculo propio"

# code, category, name_es, name_en, unit_es, unit_en, freq, source, source_url, decimals, sort
_S = [
    # ---------------- Cambiario
    ("usd_bcv", "cambiario", "Dólar oficial BCV", "Official USD rate (BCV)", "Bs/US$", "Bs/US$", "D", "BCV", BCV, 2, 10),
    ("usd_paralelo", "cambiario", "Dólar paralelo (Binance P2P)", "Parallel USD rate (Binance P2P)", "Bs/US$", "Bs/US$", "D", "Binance P2P", "https://p2p.binance.com/es/trade/all-payments/USDT?fiat=VES", 2, 20),
    ("brecha_cambiaria", "cambiario", "Brecha cambiaria", "FX gap (parallel vs. official)", "%", "%", "D", OWN, None, 1, 30),
    ("eur_bcv", "cambiario", "Euro oficial BCV", "Official EUR rate (BCV)", "Bs/€", "Bs/€", "D", "BCV", BCV, 2, 40),
    ("intervencion_bcv_mensual", "cambiario", "Intervención cambiaria (mensual)", "BCV FX intervention (monthly)", "millones US$", "US$ million", "M", "BCV · prensa (Banca y Negocios)", "https://www.bancaynegocios.com/tag/intervencion-cambiaria/", 1, 50),
    ("intervencion_bcv", "cambiario", "Intervención cambiaria (por operación)", "BCV FX intervention (per operation)", "millones US$", "US$ million", "W", "BCV · prensa (Banca y Negocios)", "https://www.bancaynegocios.com/tag/intervencion-cambiaria/", 1, 55),

    # ---------------- Monetario
    ("liquidez_m2", "monetario", "Liquidez monetaria (M2)", "Money supply (M2)", "miles de Bs", "Bs thousand", "W", "BCV", BCV + "/estadisticas/liquidez-monetaria", 0, 10),
    ("base_monetaria", "monetario", "Base monetaria", "Monetary base", "miles de Bs", "Bs thousand", "W", "BCV", BCV + "/estadisticas/base-monetaria", 0, 20),
    ("multiplicador", "monetario", "Multiplicador monetario", "Money multiplier", "veces", "x", "W", OWN, None, 2, 30),
    ("dinero_m1", "monetario", "Dinero (M1)", "Money (M1)", "miles de Bs", "Bs thousand", "W", "BCV", BCV + "/estadisticas/liquidez-monetaria", 0, 12),
    ("encaje_legal", "monetario", "Encaje legal", "Reserve requirement", "%", "%", "M", "BCV", BCV, 1, 50),

    # ---------------- Precios
    ("inflacion_mensual", "precios", "Inflación mensual", "Monthly inflation", "%", "%", "M", "BCV (vía Finanzas Digital)", "https://finanzasdigital.com/inflacion-por-pais/venezuela/", 2, 10),
    ("inflacion_interanual", "precios", "Inflación interanual", "Year-on-year inflation", "%", "%", "M", "BCV (vía Finanzas Digital)", "https://finanzasdigital.com/inflacion-por-pais/venezuela/", 2, 20),
    ("inflacion_acumulada", "precios", "Inflación acumulada en el año", "Year-to-date inflation", "%", "%", "M", "BCV (vía Finanzas Digital)", "https://finanzasdigital.com/inflacion-por-pais/venezuela/", 2, 25),
    ("ipc_eeuu", "precios", "IPC de EE.UU. (inflación en dólares)", "US CPI (dollar inflation)", "índice", "index", "M", "BLS vía FRED", "https://fred.stlouisfed.org/series/CPIAUCSL", 2, 90),

    # ---------------- Sector externo
    ("reservas_internacionales", "externo", "Reservas internacionales", "International reserves", "millones US$", "US$ million", "D", "BCV", BCV + "/estadisticas/reservas-internacionales", 0, 10),
    ("cuenta_corriente", "externo", "Cuenta corriente (balanza de pagos)", "Current account (BoP)", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 12),
    ("exportaciones_bienes", "externo", "Exportaciones de bienes", "Goods exports", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 13),
    ("exportaciones_petroleras", "externo", "Exportaciones petroleras", "Oil exports", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 14),
    ("exportaciones_no_petroleras", "externo", "Exportaciones no petroleras", "Non-oil exports", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 15),
    ("importaciones_bienes", "externo", "Importaciones de bienes", "Goods imports", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 16),
    ("transferencias_corrientes", "externo", "Transferencias corrientes (incluye remesas)", "Current transfers (incl. remittances)", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 17),
    ("inversion_directa_pais", "externo", "Inversión extranjera directa en el país", "FDI into Venezuela", "millones US$", "US$ million", "Q", "BCV", BCV, 0, 18),
    ("exportaciones_espejo", "externo", "Exportaciones (datos espejo)", "Exports (mirror data)", "millones US$", "US$ million", "A", "UN Comtrade", "https://comtradeplus.un.org", 0, 20),
    ("importaciones_espejo", "externo", "Importaciones (datos espejo)", "Imports (mirror data)", "millones US$", "US$ million", "A", "UN Comtrade", "https://comtradeplus.un.org", 0, 30),
    ("exportaciones_petroleras_bd", "externo", "Exportaciones petroleras (volumen)", "Oil exports (volume)", "miles b/d", "kb/d", "M", "Reuters (datos de embarque), vía prensa", "https://www.reuters.com", 0, 205),
    ("eeuu_importa_de_ve", "externo", "Exportaciones a EE.UU. (EE.UU. importa de Venezuela)", "Exports to the US (US imports from Venezuela)", "millones US$", "US$ million", "M", "US Census Bureau", "https://www.census.gov/foreign-trade/balance/c3070.html", 1, 206),
    ("eeuu_importa_petroleo_ve", "externo", "Exportaciones petroleras a EE.UU. (cap. 27)", "Oil exports to the US (HS 27)", "millones US$", "US$ million", "M", "US Census Bureau", "https://www.census.gov/foreign-trade/balance/c3070.html", 1, 207),
    ("eeuu_exporta_a_ve", "externo", "Importaciones desde EE.UU. (EE.UU. exporta a Venezuela)", "Imports from the US (US exports to Venezuela)", "millones US$", "US$ million", "M", "US Census Bureau", "https://www.census.gov/foreign-trade/balance/c3070.html", 1, 208),

    # ---------------- Banca
    ("cartera_credito", "banca", "Cartera de créditos (sistema)", "Loan book (system)", "millones Bs", "Bs million", "M", "SUDEBAN (vía Finanzas Digital)", "https://finanzasdigital.com/estadisticas/ve/financieras/instituciones/tabla/creditos", 0, 10),
    ("depositos_totales", "banca", "Captaciones del público (sistema)", "Deposits (system)", "millones Bs", "Bs million", "M", "SUDEBAN (vía Finanzas Digital)", "https://finanzasdigital.com/estadisticas/ve/financieras/instituciones/tabla/captaciones", 0, 20),
    ("tasa_activa", "banca", "Tasa activa promedio (bancos universales)", "Average lending rate (universal banks)", "%", "%", "W", "BCV", BCV, 2, 40),
    ("tasa_plazo", "banca", "Tasa de depósitos a plazo", "Time deposit rate", "%", "%", "M", "BCV", BCV, 2, 45),
    ("tasa_ahorro", "banca", "Tasa de depósitos de ahorro", "Savings deposit rate", "%", "%", "M", "BCV", BCV, 2, 50),
    ("intermediacion", "banca", "Intermediación crediticia", "Loan-to-deposit ratio", "%", "%", "M", OWN, None, 1, 30),

    # ---------------- Petróleo y gas
    ("petroleo_prod_opep_fs", "petroleo", "Producción de crudo · OPEP fuentes secundarias", "Crude output · OPEC secondary sources", "miles b/d", "kb/d", "M", "OPEP MOMR", OPEP, 0, 10),
    ("petroleo_prod_opep_cd", "petroleo", "Producción de crudo · comunicación directa", "Crude output · direct communication", "miles b/d", "kb/d", "M", "OPEP MOMR", OPEP, 0, 20),
    ("petroleo_prod_eia", "petroleo", "Producción de crudo (EIA, serie larga)", "Crude production (EIA, long series)", "miles b/d", "kb/d", "M", "EIA", EIA, 0, 30),
    ("merey", "petroleo", "Cesta venezolana (Merey)", "Venezuelan basket (Merey)", "US$/b", "US$/bbl", "M", "OPEP MOMR", OPEP, 2, 40),
    ("brent", "petroleo", "Brent", "Brent", "US$/b", "US$/bbl", "D", "EIA", EIA, 2, 50),
    ("wti", "petroleo", "WTI", "WTI", "US$/b", "US$/bbl", "D", "EIA", EIA, 2, 60),
    ("henry_hub", "petroleo", "Gas natural Henry Hub (referencia EE.UU.)", "Henry Hub natural gas (US benchmark)", "US$/MMBtu", "US$/MMBtu", "M", "Banco Mundial", WB, 2, 70),

    # ---------------- Mercados
    ("ibc", "mercados", "Índice Bursátil Caracas (IBC)", "Caracas Stock Index (IBC)", "puntos", "points", "D", "BVC", "https://www.bolsadecaracas.com", 2, 10),
    ("ibc_usd_paralelo", "mercados", "IBC en dólares (paralelo)", "IBC in US$ (parallel rate)", "puntos US$", "US$ points", "D", OWN, None, 4, 12),
    ("ibc_usd", "mercados", "IBC en dólares (oficial)", "IBC in US$ (official rate)", "puntos US$", "US$ points", "D", OWN, None, 4, 15),
    ("ibc_financiero", "mercados", "Índice Financiero", "Financial Index", "puntos", "points", "D", "BVC", "https://www.bolsadecaracas.com", 2, 20),
    ("ibc_industrial", "mercados", "Índice Industrial", "Industrial Index", "puntos", "points", "D", "BVC", "https://www.bolsadecaracas.com", 2, 30),
    ("bvc_monto", "mercados", "Monto negociado BVC (renta variable)", "BVC traded value (equities)", "Bs", "Bs", "D", "BVC", "https://www.bolsadecaracas.com", 0, 40),
    ("bvc_monto_rf", "mercados", "Monto negociado BVC (renta fija)", "BVC traded value (fixed income)", "Bs", "Bs", "D", "BVC", "https://www.bolsadecaracas.com", 0, 45),
    ("bvc_volumen_usd", "mercados", "Volumen mensual BVC (todas las ruedas)", "BVC monthly volume (all markets)", "millones US$", "US$ million", "M", "SUNAVAL", "https://www.sunaval.gob.ve/mensuales-2/", 1, 50),
    ("mob_monto", "mercados", "Mercado de Otros Bienes · monto", "Other Goods Market · traded value", "millones US$", "US$ million", "M", "SUNAVAL", "https://www.sunaval.gob.ve/mensuales-2/", 1, 60),
    ("mob_operaciones", "mercados", "Mercado de Otros Bienes · operaciones", "Other Goods Market · trades", "operaciones", "trades", "M", "SUNAVAL", "https://www.sunaval.gob.ve/mensuales-2/", 0, 65),
    ("bolpriaven_monto", "mercados", "BOLPRIAVEN · monto negociado", "BOLPRIAVEN · traded value", "millones US$", "US$ million", "M", "SUNAVAL", "https://www.sunaval.gob.ve/mensuales-2/", 2, 70),

    # ---------------- Deuda soberana
    ("deuda_venz_prom", "deuda", "Bonos de la República · precio promedio", "Republic bonds · average price", "% del nominal", "% of par", "D", "Bloomberg", None, 2, 10),
    ("deuda_pdvsa_prom", "deuda", "Bonos de PDVSA · precio promedio", "PDVSA bonds · average price", "% del nominal", "% of par", "D", "Bloomberg", None, 2, 20),

    # ---------------- Materias primas (relevantes para Venezuela)
    ("oro", "commodities", "Oro", "Gold", "US$/oz", "US$/oz", "M", "Banco Mundial", WB, 2, 10),
    ("mineral_hierro", "commodities", "Mineral de hierro", "Iron ore", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 20),
    ("aluminio", "commodities", "Aluminio", "Aluminum", "US$/t", "US$/t", "M", "Banco Mundial", WB, 0, 30),
    ("maiz", "commodities", "Maíz", "Maize", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 40),
    ("trigo", "commodities", "Trigo (US HRW)", "Wheat (US HRW)", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 50),
    ("arroz", "commodities", "Arroz (Tailandia 5%)", "Rice (Thai 5%)", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 60),
    ("cafe", "commodities", "Café arábica", "Coffee, Arabica", "US$/kg", "US$/kg", "M", "Banco Mundial", WB, 2, 70),
    ("cacao", "commodities", "Cacao", "Cocoa", "US$/kg", "US$/kg", "M", "Banco Mundial", WB, 2, 80),
    ("azucar", "commodities", "Azúcar (mundial)", "Sugar (world)", "US$/kg", "US$/kg", "M", "Banco Mundial", WB, 3, 90),
    ("soya", "commodities", "Soya", "Soybeans", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 100),
    ("urea", "commodities", "Urea", "Urea", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 110),
    ("dap", "commodities", "Fosfato diamónico (DAP)", "DAP fertilizer", "US$/t", "US$/t", "M", "Banco Mundial", WB, 2, 120),

    # ---------------- Actividad y fiscal
    ("pib_real_var", "actividad", "PIB real trimestral (var. interanual)", "Quarterly real GDP (y/y)", "%", "%", "Q", "BCV", BCV, 2, 10),
    ("pib_petrolero_var", "actividad", "PIB petrolero trimestral (var. interanual)", "Quarterly oil GDP (y/y)", "%", "%", "Q", "BCV", BCV, 2, 12),
    ("pib_no_petrolero_var", "actividad", "PIB no petrolero trimestral (var. interanual)", "Quarterly non-oil GDP (y/y)", "%", "%", "Q", "BCV", BCV, 2, 14),
    ("pib_anual_var", "actividad", "PIB real anual (var. %)", "Annual real GDP (%)", "%", "%", "A", "BCV", BCV, 2, 16),
    ("pib_petrolero_anual_var", "actividad", "PIB petrolero anual (var. %)", "Annual oil GDP (%)", "%", "%", "A", "BCV", BCV, 2, 17),
    ("pib_no_petrolero_anual_var", "actividad", "PIB no petrolero anual (var. %)", "Annual non-oil GDP (%)", "%", "%", "A", "BCV", BCV, 2, 18),
    ("recaudacion_seniat", "actividad", "Recaudación SENIAT", "SENIAT tax collection", "millones Bs", "Bs million", "M", "SENIAT (vía prensa)", "https://www.seniat.gob.ve", 0, 20),
    ("recaudacion_seniat_usd", "actividad", "Recaudación SENIAT en US$", "SENIAT tax collection in US$", "millones US$", "US$ million", "M", "SENIAT (vía prensa)", "https://www.seniat.gob.ve", 1, 25),
]

# ------------------------------------------------------------------ plan de actualización
# method: auto (robot) · calibrar (robot listo, falta verificar el archivo real) · manual
# stale: días sin dato nuevo a partir de los cuales la serie se marca "atrasada"
A, C, M = "auto", "calibrar", "manual"
PLAN = {
    "usd_bcv": (A, 5, "Robot fx cada 30 min (portal BCV por fecha valor). Histórico diario desde la reconversión de oct-2021."),
    "usd_paralelo": (A, 4, "Robot fx cada 30 min: mediana de los mejores anuncios de compra y venta USDT/VES en Binance P2P."),
    "brecha_cambiaria": (A, 5, "Se calcula sola: paralelo ÷ oficial − 1."),
    "eur_bcv": (A, 5, "Robot fx (portal BCV)."),
    "intervencion_bcv_mensual": (A, 40, "Robot de prensa diario: suma de las ventas del BCV a la banca reportadas, o la asignación mensual anunciada."),
    "intervencion_bcv": (A, 15, "Robot de prensa diario (titulares de Banca y Negocios)."),
    "liquidez_m2": (A, 14, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, histórico desde 1997."),
    "dinero_m1": (A, 14, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, desde 1997."),
    "base_monetaria": (A, 14, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, desde 2001."),
    "multiplicador": (A, 14, "Se calcula solo: M2 ÷ base monetaria."),
    
    "encaje_legal": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual, desde 2004."),
    "exportaciones_petroleras_bd": (A, 45, "Robot press diario: cifras mensuales de embarques que publica Reuters (sale los primeros días de cada mes)."),
    "eeuu_importa_de_ve": (A, 75, "Robot census diario (Census Bureau; sale ~5 semanas después de cada mes)."),
    "eeuu_importa_petroleo_ve": (A, 75, "Robot census diario."), "eeuu_exporta_a_ve": (A, 75, "Robot census diario."),
    "ipc_eeuu": (A, 60, "Robot fx_historico semanal (FRED, serie CPIAUCSL). Sirve para la calculadora de inflación en dólares."),
    "inflacion_mensual": (A, 40, "Robot inflation diario (cifras oficiales del BCV), histórico desde 1986."),
    "inflacion_interanual": (A, 40, "Robot inflation diario, histórico desde 1986."),
    "inflacion_acumulada": (A, 40, "Robot inflation diario."),
    
    "reservas_internacionales": (A, 7, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Diaria desde 2016 y mensual desde 1996."),
    "exportaciones_espejo": (A, 400, "Robot trade los domingos (UN Comtrade)."),
    "importaciones_espejo": (A, 400, "Robot trade los domingos (UN Comtrade)."),
    "cartera_credito": (A, 45, "Robot banking diario: total del sistema y ranking por banco (balances de publicación)."),
    "depositos_totales": (A, 45, "Robot banking diario."),
    "intermediacion": (A, 45, "Se calcula sola: créditos ÷ captaciones."),
    "petroleo_prod_opep_fs": (A, 45, "Robot opec diario: informe MOMR (sale entre el 10 y el 14 de cada mes)."),
    "petroleo_prod_opep_cd": (A, 45, "Robot opec diario (MOMR)."),
    "petroleo_prod_eia": (A, 120, "Robot oil diario (EIA, desde 1973; rezago ~3 meses)."),
    "merey": (A, 45, "Robot opec diario (MOMR, tabla de cestas)."),
    "brent": (A, 10, "Robot oil (EIA)."), "wti": (A, 10, "Robot oil (EIA)."),
    "henry_hub": (A, 45, "Robot commodities (Banco Mundial)."),
    "ibc": (A, 5, "Robot bvc cada 30 min en horario de mercado."),
    "ibc_usd_paralelo": (A, 5, "Se calcula solo (IBC ÷ paralelo)."),
    "ibc_usd": (A, 5, "Se calcula solo (IBC ÷ oficial)."),
    "ibc_financiero": (A, 5, "Robot bvc."), "ibc_industrial": (A, 5, "Robot bvc."),
    "bvc_monto": (A, 5, "Robot bvc."), "bvc_monto_rf": (A, 10, "Robot bvc."),
    "bvc_volumen_usd": (A, 45, "Robot sunaval diario (informe mensual de SUNAVAL)."),
    "mob_monto": (A, 45, "Robot sunaval diario."), "mob_operaciones": (A, 45, "Robot sunaval diario."),
    "bolpriaven_monto": (A, 45, "Robot sunaval diario."),
    "deuda_venz_prom": (M, 10, "Subir data/bonos/bloomberg.xlsx (plantilla con fórmulas Bloomberg) cuando quieras actualizar; idealmente cada viernes."),
    "deuda_pdvsa_prom": (M, 10, "Mismo archivo bloomberg.xlsx."),
    "pib_real_var": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 2008."),
    "cuenta_corriente": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 1997."),
    "exportaciones_bienes": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 1997."),
    "exportaciones_petroleras": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "exportaciones_no_petroleras": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "importaciones_bienes": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "transferencias_corrientes": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "inversion_directa_pais": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "tasa_activa": (A, 14, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal desde 2005."),
    "tasa_plazo": (A, 45, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual desde 2004."),
    "tasa_ahorro": (A, 45, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual desde 2004."),
    "pib_petrolero_var": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "pib_no_petrolero_var": (A, 120, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "pib_anual_var": (A, 400, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Anual desde 2008."),
    "pib_petrolero_anual_var": (A, 400, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "pib_no_petrolero_anual_var": (A, 400, "Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva."),
    "recaudacion_seniat": (A, 45, "Robot de prensa diario: cifras mensuales del SENIAT."),
    "recaudacion_seniat_usd": (A, 45, "Robot de prensa diario."),
}
for code in ("oro", "mineral_hierro", "aluminio", "maiz", "trigo", "arroz", "cafe", "cacao", "azucar", "soya", "urea", "dap"):
    PLAN[code] = (A, 45, "Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960).")

_KEYS = ["code", "category", "name_es", "name_en", "unit_es", "unit_en", "frequency", "source", "source_url", "decimals", "sort"]
SERIES = []
for s in _S:
    d = dict(zip(_KEYS, s))
    method, stale, howto = PLAN.get(d["code"], (A, 30, ""))
    d.update(is_manual=method == M, method=method, stale_days=stale, howto_es=howto)
    SERIES.append(d)

assert len({s["code"] for s in SERIES}) == len(SERIES), "códigos duplicados en el catálogo"


def run():
    with Run("catalog") as r:
        r.rows = upsert("series", SERIES, "code")
