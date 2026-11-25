import { notFound } from "next/navigation";
import BondsTable from "@/components/BondsTable";
import ChartCard from "@/components/ChartCard";
import MacroNav from "@/components/MacroNav";
import { BarList, chartLabels, Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { bankRanking, bankSample, bankSystem, bonds, configured, history, latest, news } from "@/lib/data";
import Tabs from "@/components/Tabs";
import { TOPIC_RX } from "@/lib/topics";
import { groupNews } from "@/lib/newsgroup";
import type { Latest } from "@/lib/data";
import BankExplorer from "@/components/BankExplorer";
import { num } from "@/lib/format";
import { cumulative, valueAt } from "@/lib/stats";
import type { Range } from "@/components/Range";
import { CATEGORIES, LANGS, t, type Category, type Lang } from "@/lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CATEGORIES.map((cat) => ({ lang, cat })));
}

const INTRO: Record<Category, { es: string; en: string }> = {
  cambiario: { es: "Dólar oficial del BCV por fecha valor, mercado alternativo (Binance P2P), brecha e intervención cambiaria.", en: "BCV official rate by value date, Binance P2P alternative-market rate, gap and FX intervention." },
  monetario: { es: "Liquidez (M1 y M2) desde 1997, base monetaria desde 2001, multiplicador y encaje (BCV). Saldos en miles de bolívares actuales: use escala log para ver toda la serie.", en: "Money (M1, M2) since 1997, monetary base since 2001, multiplier and reserve requirement (BCV). Balances in thousand current bolivars: use log scale for the full series." },
  precios: { es: "Inflación oficial del BCV (INPC), serie mensual desde 1986.", en: "BCV official inflation (CPI), monthly series since 1986." },
  externo: { es: "Reservas internacionales del BCV (diarias, desde 1996) arriba; luego lo más reciente: exportaciones petroleras por seguimiento de buques y comercio con EE.UU. (Census y EIA). La balanza de pagos del BCV es trimestral y sale con unos 6 meses de rezago, por eso queda en «Ver más».", en: "International reserves (since 1996), BCV quarterly balance of payments (since 1997), monthly oil exports, monthly trade with the US (Census, near real time) and mirror trade." },
  banca: { es: "Cartera de créditos y captaciones del sistema bancario, en bolívares y en dólares, y ranking por banco.", en: "Banking system loans and deposits in bolivars and dollars, and bank ranking." },
  petroleo: { es: "Producción de crudo (OPEP y EIA), cesta Merey y precios de referencia (Brent, WTI y gas Henry Hub). Las materias primas y el agro tienen su propio botón arriba.", en: "Crude output (OPEC and EIA), Merey basket and benchmark prices." },
  mercados: { es: "Índices y volúmenes de la Bolsa de Valores de Caracas y BOLPRIAVEN.", en: "Caracas Stock Exchange and BOLPRIAVEN indices and volumes." },
  actividad: { es: "PIB real del BCV por trimestre (total, petrolero y no petrolero), variaciones anuales (se actualizan al cierre de cada año) y recaudación del SENIAT. Por pestañas: PIB y crecimiento (incluido el PIB en dólares), cuentas fiscales y población y empleo, con las cifras anuales del Plan Venezuela Renace.", en: "BCV real GDP (quarterly and annual; total, oil and non-oil) and SENIAT tax collection. Tabs: GDP and growth (including GDP in dollars), public finances, and population and jobs, with annual figures from Plan Venezuela Renace." },
  deuda: { es: "Riesgo país (EMBI de JPMorgan) y bonos de la República y de PDVSA (precio en % del valor nominal).", en: "Country risk (JPMorgan EMBI) and Republic and PDVSA bonds (price as % of par)." },
  commodities: { es: "Precios internacionales de materias primas relevantes para Venezuela (Banco Mundial, desde 1960).", en: "International prices of commodities relevant to Venezuela (World Bank, since 1960)." },
};
const BARS = new Set(["exportaciones_espejo_mensual", "exportaciones_petroleras_espejo_mensual", "importaciones_espejo_mensual", "eeuu_importa_crudo_ve_bd", "eeuu_importa_de_ve", "eeuu_importa_petroleo_ve", "eeuu_exporta_a_ve", "exportaciones_petroleras_bd", "intervencion_bcv_mensual", "intervencion_bcv", "inflacion_mensual", "mob_monto", "mob_operaciones", "bvc_volumen_usd",
  "bolpriaven_monto", "recaudacion_seniat", "recaudacion_seniat_usd", "pib_real_var", "exportaciones_espejo", "importaciones_espejo",
  "pib_petrolero_var", "pib_no_petrolero_var", "pib_anual_var", "pib_petrolero_anual_var", "pib_no_petrolero_anual_var", "cuenta_corriente",
  "exportaciones_bienes", "exportaciones_petroleras", "exportaciones_no_petroleras", "importaciones_bienes", "transferencias_corrientes", "inversion_directa_pais",
  // Plan Venezuela Renace (cifras anuales)
  "capex_pdvsa", "fiscal_ingresos_gc_pib", "fiscal_ingresos_hidroc_pib", "fiscal_ingresos_no_hidroc_pib", "fiscal_gastos_gc_pib", "fiscal_inversion_publica_pib", "fiscal_saldo_primario_gc_pib", "fiscal_resultado_pdvsa_pib", "fiscal_subsidios_hidroc_pib", "fiscal_saldo_primario_spnf_pib", "fiscal_ingresos_gc_usd", "fiscal_ingresos_hidroc_usd", "fiscal_regalias_usd", "fiscal_iva_usd", "fiscal_islr_usd", "fiscal_aranceles_usd", "fiscal_gastos_gc_usd", "fiscal_salarios_usd", "fiscal_saldo_primario_spnf_usd", "bp_saldo_servicios", "bp_saldo_renta", "bp_cuenta_financiera", "bp_inversion_cartera", "bp_otra_inversion", "bp_cc_sin_hidroc_usd", "bp_cuenta_corriente_pib"]);
const LOG = new Set(["usd_bcv", "usd_paralelo", "eur_bcv", "liquidez_m2", "dinero_m1", "base_monetaria", "inflacion_interanual", "cartera_credito", "depositos_totales", "ibc"]);

const REN_NOTE = { es: "Cifra anual del documento «Plan Venezuela Renace» (Vicepresidencia, noviembre de 2026). Solo historia; no incluye las proyecciones del plan.", en: "Annual figure from the «Plan Venezuela Renace» document (Vice Presidency, November 2026). History only; plan projections are not included." };
const NOTES: Record<string, { es: string; en: string }> = {
  ...Object.fromEntries(["pib_nominal_usd", "pib_per_capita_usd", "desempleo", "poblacion", "pib_nominal_hidroc_usd", "pib_nominal_no_hidroc_usd", "pib_real_indice", "pib_real_no_hidroc_indice", "gas_comercializable", "capex_pdvsa", "gas_asociado", "gas_no_asociado", "fiscal_ingresos_gc_pib", "fiscal_ingresos_hidroc_pib", "fiscal_ingresos_no_hidroc_pib", "fiscal_gastos_gc_pib", "fiscal_inversion_publica_pib", "fiscal_saldo_primario_gc_pib", "fiscal_subsidios_hidroc_pib", "fiscal_ingresos_gc_usd", "fiscal_ingresos_hidroc_usd", "fiscal_regalias_usd", "fiscal_iva_usd", "fiscal_islr_usd", "fiscal_aranceles_usd", "fiscal_gastos_gc_usd", "fiscal_salarios_usd", "fiscal_saldo_primario_spnf_usd", "bp_saldo_servicios", "bp_saldo_renta", "bp_cuenta_financiera", "bp_inversion_cartera", "bp_otra_inversion", "bp_cc_sin_hidroc_usd", "bp_cuenta_corriente_pib"].map((c) => [c, REN_NOTE])),
  gas_produccion: { es: "Producción bruta de gas natural (asociado y no asociado), en miles de millones de pies cúbicos diarios, según el Plan Venezuela Renace (nov-2026). El gas comercializable es la parte que llega al mercado.", en: "Gross natural gas output (associated and non-associated), bcf/d, per Plan Venezuela Renace (Nov-2026). Marketable gas is the share that reaches the market." },
  fiscal_saldo_primario_spnf_pib: { es: "Gobierno central y PDVSA (sector público no financiero), base consolidada del Plan Venezuela Renace (nov-2026). El resultado de PDVSA descuenta los subsidios implícitos a gasolina, diésel y gas.", en: "Central government and PDVSA (non-financial public sector), consolidated basis from Plan Venezuela Renace (Nov-2026). PDVSA's result nets out implicit fuel and gas subsidies." },
  fiscal_resultado_pdvsa_pib: { es: "Gobierno central y PDVSA (sector público no financiero), base consolidada del Plan Venezuela Renace (nov-2026). El resultado de PDVSA descuenta los subsidios implícitos a gasolina, diésel y gas.", en: "Central government and PDVSA (non-financial public sector), consolidated basis from Plan Venezuela Renace (Nov-2026). PDVSA's result nets out implicit fuel and gas subsidies." },
  henry_hub: { es: "Referencia internacional de EE.UU. (Banco Mundial). No es el precio del gas venezolano: Venezuela no publica un precio de gas ni una serie de exportaciones de gas.", en: "US international benchmark (World Bank). Not the price of Venezuelan gas: Venezuela publishes no gas price or gas export series." },
  merey: { es: "Precio mensual de la cesta Merey según el informe mensual de la OPEP (MOMR), que sale a mediados de cada mes con el dato del mes anterior.", en: "Monthly Merey price from OPEC's Monthly Oil Market Report, published mid-month with the previous month's figure." },
  brent: { es: "Spot de la EIA; los días más recientes, mientras la EIA publica (≈1 semana de rezago), son el cierre del futuro del primer mes.", en: "EIA spot; the latest days, until EIA publishes (≈1 week lag), are the front-month futures close." },
  wti: { es: "Spot de la EIA; los días más recientes, mientras la EIA publica (≈1 semana de rezago), son el cierre del futuro del primer mes.", en: "EIA spot; the latest days, until EIA publishes (≈1 week lag), are the front-month futures close." },
  intervencion_bcv_mensual: { es: "2025: ventas del BCV + USDT; 2026: subastas (ene-mar) e intervención del BCV, según AGPV (oct-2026). Desde octubre se completa con las cifras que reporta la prensa.", en: "2025: BCV sales + USDT; 2026: auctions (Jan-Mar) and BCV intervention, per AGPV (Oct-2026). From October, filled with press-reported figures." },
  exportaciones_petroleras_bd: { es: "Barriles diarios embarcados en el mes según los datos de seguimiento de buques que publica Reuters a inicios de cada mes.", en: "Barrels per day shipped in the month, per the tanker-tracking data Reuters publishes early each month." },
  exportaciones_espejo_mensual: { es: "Suma de lo que cada socio comercial declara haber comprado a Venezuela ese mes (UN Comtrade). Los meses más recientes son parciales: faltan los socios que aún no reportan (EE.UU., España e India suelen reportar primero).", en: "Sum of what each trading partner reports buying from Venezuela that month (UN Comtrade). Recent months are partial until all partners report." },
  importaciones_espejo_mensual: { es: "Suma de lo que cada socio declara haber vendido a Venezuela ese mes (UN Comtrade). Los meses más recientes son parciales.", en: "Sum of what each partner reports selling to Venezuela that month (UN Comtrade). Recent months are partial." },
  eeuu_importa_crudo_ve_bd: { es: "Barriles diarios de crudo venezolano que entraron a EE.UU. en el mes (EIA). La versión semanal adelanta el dato.", en: "Barrels per day of Venezuelan crude entering the US in the month (EIA). The weekly version is more timely." },
  recaudacion_seniat: { es: "Lo que el SENIAT anuncia haber recaudado en el mes, en bolívares. Use el botón US$ oficial para ver su valor en dólares a la tasa de cada mes.", en: "SENIAT's announced monthly collection in bolivars. Use the US$ button to see its dollar value at each month's rate." },
  recaudacion_seniat_usd: { es: "Solo los meses en que el SENIAT o la prensa informaron la cifra directamente en dólares; para el resto, use el botón US$ en la tarjeta en bolívares.", en: "Only months where SENIAT or the press reported the figure directly in dollars." },
  embi_venezuela: { es: "Diferencial en puntos básicos entre el rendimiento de los bonos venezolanos y el de los bonos del Tesoro de EE.UU. (EMBI de JPMorgan): cuanto más alto, más caro le resulta al país endeudarse. 100 pbs = 1 punto porcentual.", en: "Spread in basis points of Venezuelan bonds over US Treasuries (JPMorgan EMBI): higher means costlier borrowing. 100 bps = 1 percentage point." },
  inflacion_mensual: { es: "Cuando el BCV o la Presidencia anuncian la inflación del mes antes de que salga la cifra habitual, se muestra ese anuncio (octubre 2026: 6,2%, anunciado el 3 de noviembre) y se reemplaza solo al publicarse la cifra oficial.", en: "When the BCV or the Presidency announces the month's inflation before the usual release, that announcement is shown (October 2026: 6.2%, announced on November 3) and replaced automatically once the official figure is published." },
  pib_petrolero_anual_var: { es: "Variación del año completo: se actualiza una vez al año, cuando el BCV publica el cierre del año (último: 2025). Para el año en curso, vea las cifras trimestrales.", en: "Full-year change: updated once a year, when the BCV publishes the year-end figure (latest: 2025). For the current year, see the quarterly figures." },
  pib_no_petrolero_anual_var: { es: "Variación del año completo: se actualiza una vez al año, cuando el BCV publica el cierre del año (último: 2025). Para el año en curso, vea las cifras trimestrales.", en: "Full-year change: updated once a year, when the BCV publishes the year-end figure (latest: 2025). For the current year, see the quarterly figures." },
  pib_real_var: { es: "El BCV publica el PIB solo por trimestre: no existe una cifra oficial mensual. El III trimestre de 2026 (6,6%) es el anuncio preliminar de la Presidencia del 3 de noviembre; se reemplaza solo cuando el BCV publique su archivo.", en: "The BCV publishes GDP only quarterly: there is no official monthly figure. Q3 2026 (6.6%) is the preliminary figure announced by the Presidency on November 3; it is replaced automatically once the BCV publishes its file." },
};
const VISIBLE_DEF = 4; // tarjetas visibles antes del desplegable «Ver más»
const HIDDEN = new Set(["pib_anual_var", "taladros_venezuela", "petroleo_prod_opep_fs", "petroleo_prod_opep_cd", "petroleo_prod_eia", "intervencion_bcv", "inflacion_acumulada", "ipc_eeuu"]);
/** Rango por tarjeta cuando el estándar (1M…Máx) no aplica. */
const RANGES: Record<string, Range[]> = {
  inflacion_mensual: ["YTD", "1A", "MAX"], inflacion_interanual: ["1A"], merey: [], intervencion_bcv_mensual: ["1A", "MAX"],
  // cifras anuales del Plan Venezuela Renace: sin botones de rango (toda la serie)
  pib_nominal_usd: [], pib_per_capita_usd: [], desempleo: [], poblacion: [], pib_nominal_hidroc_usd: [], pib_nominal_no_hidroc_usd: [], pib_real_indice: [], pib_real_no_hidroc_indice: [], gas_comercializable: [], capex_pdvsa: [], gas_produccion: [], gas_asociado: [], gas_no_asociado: [], fiscal_ingresos_gc_pib: [], fiscal_ingresos_hidroc_pib: [], fiscal_ingresos_no_hidroc_pib: [], fiscal_gastos_gc_pib: [], fiscal_inversion_publica_pib: [], fiscal_saldo_primario_gc_pib: [], fiscal_resultado_pdvsa_pib: [], fiscal_subsidios_hidroc_pib: [], fiscal_saldo_primario_spnf_pib: [], fiscal_ingresos_gc_usd: [], fiscal_ingresos_hidroc_usd: [], fiscal_regalias_usd: [], fiscal_iva_usd: [], fiscal_islr_usd: [], fiscal_aranceles_usd: [], fiscal_gastos_gc_usd: [], fiscal_salarios_usd: [], fiscal_saldo_primario_spnf_usd: [], bp_saldo_servicios: [], bp_saldo_renta: [], bp_cuenta_financiera: [], bp_inversion_cartera: [], bp_otra_inversion: [], bp_cc_sin_hidroc_usd: [], bp_cuenta_corriente_pib: [],
};
const INITIAL: Record<string, Range> = { inflacion_interanual: "1A", merey: "MAX", intervencion_bcv_mensual: "1A", recaudacion_seniat: "YTD", recaudacion_seniat_usd: "YTD" };
const HILO = new Set(["brent", "wti", "henry_hub", "oro", "plata", "cobre", "aluminio", "mineral_hierro", "cafe", "cacao", "azucar", "maiz_cbot", "trigo_kc", "soya_cbot", "embi_venezuela"]);

/** Pestañas por tema en las páginas con muchas tarjetas (lo que no encaja en ninguna va a la última). */
const GROUPS: Partial<Record<Category, { id: string; es: string; en: string; rx: RegExp }[]>> = {
  actividad: [
    { id: "pib", es: "PIB y crecimiento", en: "GDP and growth", rx: /^pib_/ },
    { id: "fiscal", es: "Cuentas fiscales", en: "Public finances", rx: /^(fiscal_|recaudacion_)/ },
    { id: "poblacion", es: "Población y empleo", en: "Population and jobs", rx: /^(poblacion|desempleo)$/ },
  ],
  externo: [
    { id: "reciente", es: "Comercio reciente", en: "Recent trade", rx: /espejo_mensual$|_bd$|_sem$|^eeuu_/ },
    { id: "balanza", es: "Balanza de pagos", en: "Balance of payments", rx: /^(cuenta_corriente|exportaciones_bienes|exportaciones_petroleras|exportaciones_no_petroleras|importaciones_bienes|transferencias_corrientes|inversion_directa_pais)$|^bp_/ },
    { id: "anual", es: "Comercio anual por socios", en: "Annual trade by partner", rx: /espejo$/ },
  ],
  petroleo: [
    { id: "crudo", es: "Crudo y precios", en: "Crude and prices", rx: /^(merey|brent|wti|henry_hub|taladros_venezuela|petroleo_)/ },
    { id: "gas", es: "Gas e inversión", en: "Gas and investment", rx: /^(gas_|capex_)/ },
  ],
};

/** Gráficas combinadas: series hermanas en una sola lectura (las series sueltas quedan en «Ver cada serie por separado»). */
type Combo = { group: string; id: string; es: string; en: string; codes: string[]; mode: "stack" | "group" | "line"; unit_es: string; unit_en: string; decimals: number; note_es?: string; note_en?: string; annual?: boolean };
const COMBOS: Combo[] = [
  { group: "pib", id: "c-pib-sector", es: "PIB nominal en US$: hidrocarburos y resto de la economía", en: "Nominal GDP in US$: hydrocarbons and the rest", codes: ["pib_nominal_hidroc_usd", "pib_nominal_no_hidroc_usd"], mode: "stack", unit_es: "miles de millones US$", unit_en: "US$ bn", decimals: 1, annual: true,
    note_es: "La suma de las dos barras es el PIB total. Plan Venezuela Renace (nov-2026).", note_en: "The two bars add up to total GDP. Plan Venezuela Renace (Nov-2026)." },
  { group: "pib", id: "c-pib-real", es: "PIB real: total y sin hidrocarburos (2012 = 100)", en: "Real GDP: total and non-hydrocarbon (2012 = 100)", codes: ["pib_real_indice", "pib_real_no_hidroc_indice"], mode: "line", unit_es: "índice", unit_en: "index", decimals: 1, annual: true },
  { group: "pib", id: "c-pib-anual", es: "Crecimiento anual del PIB: total, petrolero y no petrolero", en: "Annual GDP growth: total, oil and non-oil", codes: ["pib_anual_var", "pib_petrolero_anual_var", "pib_no_petrolero_anual_var"], mode: "group", unit_es: "%", unit_en: "%", decimals: 1, annual: true },
  { group: "fiscal", id: "c-fiscal-ig", es: "Ingresos y gasto del gobierno central (% del PIB)", en: "Central government revenue and spending (% of GDP)", codes: ["fiscal_ingresos_gc_pib", "fiscal_gastos_gc_pib"], mode: "group", unit_es: "% del PIB", unit_en: "% of GDP", decimals: 1, annual: true },
  { group: "fiscal", id: "c-fiscal-origen", es: "De dónde vienen los ingresos: hidrocarburos y resto (% del PIB)", en: "Where revenue comes from: hydrocarbons and the rest (% of GDP)", codes: ["fiscal_ingresos_hidroc_pib", "fiscal_ingresos_no_hidroc_pib"], mode: "stack", unit_es: "% del PIB", unit_en: "% of GDP", decimals: 1, annual: true },
  { group: "fiscal", id: "c-fiscal-saldo", es: "Saldo primario: gobierno central, PDVSA y sector público (% del PIB)", en: "Primary balance: central government, PDVSA and public sector (% of GDP)", codes: ["fiscal_saldo_primario_gc_pib", "fiscal_resultado_pdvsa_pib", "fiscal_saldo_primario_spnf_pib"], mode: "group", unit_es: "% del PIB", unit_en: "% of GDP", decimals: 1, annual: true,
    note_es: "Gobierno central + PDVSA = sector público no financiero. El resultado de PDVSA descuenta los subsidios a gasolina, diésel y gas.", note_en: "Central government + PDVSA = non-financial public sector. PDVSA's result nets out fuel and gas subsidies." },
  { group: "fiscal", id: "c-fiscal-impuestos", es: "Recaudación en US$: IVA, ISLR, aranceles y regalías", en: "Collection in US$: VAT, income tax, tariffs and royalties", codes: ["fiscal_iva_usd", "fiscal_islr_usd", "fiscal_aranceles_usd", "fiscal_regalias_usd"], mode: "group", unit_es: "miles de millones US$", unit_en: "US$ bn", decimals: 1, annual: true },
  { group: "gas", id: "c-gas", es: "Producción de gas natural: asociado y no asociado", en: "Natural gas output: associated and non-associated", codes: ["gas_asociado", "gas_no_asociado"], mode: "stack", unit_es: "miles de millones de pies³/d", unit_en: "bcf/d", decimals: 2, annual: true,
    note_es: "El gas asociado sale junto con el petróleo; el no asociado, de yacimientos de gas libre. Plan Venezuela Renace (nov-2026).", note_en: "Associated gas comes out with oil; non-associated gas from free-gas fields. Plan Venezuela Renace (Nov-2026)." },
  { group: "balanza", id: "c-bop-x", es: "Exportaciones de bienes: petroleras y no petroleras (trimestral)", en: "Goods exports: oil and non-oil (quarterly)", codes: ["exportaciones_petroleras", "exportaciones_no_petroleras"], mode: "stack", unit_es: "millones US$", unit_en: "US$ million", decimals: 0 },
  { group: "balanza", id: "c-bop-xm", es: "Exportaciones e importaciones de bienes (trimestral)", en: "Goods exports and imports (quarterly)", codes: ["exportaciones_bienes", "importaciones_bienes"], mode: "line", unit_es: "millones US$", unit_en: "US$ million", decimals: 0 },
  { group: "balanza", id: "c-bop-fin", es: "Cuenta financiera: inversión de cartera y otra inversión (anual)", en: "Financial account: portfolio and other investment (annual)", codes: ["bp_inversion_cartera", "bp_otra_inversion"], mode: "group", unit_es: "millones US$", unit_en: "US$ million", decimals: 0, annual: true },
];

/** Años sin dato y años parciales en las series espejo de Comtrade. */
function mirrorNote(pts: [string, number][], es: boolean) {
  if (!pts.length) return undefined;
  const ys = pts.map((p) => Number(p[0].slice(0, 4)));
  const now = new Date().getFullYear();
  const missing: number[] = [];
  for (let y = ys[0]; y <= now; y++) if (!ys.includes(y)) missing.push(y);
  const vals = Object.fromEntries(pts.map((p) => [Number(p[0].slice(0, 4)), p[1]]));
  const partial = ys.filter((y) => y >= now - 2 && vals[y - 1] && vals[y] < vals[y - 1] * 0.6);
  const parts = [] as string[];
  if (missing.length) parts.push(es ? `Sin datos: ${missing.join(", ")}.` : `No data: ${missing.join(", ")}.`);
  if (partial.length) parts.push(es ? `Parciales (aún faltan socios por reportar): ${partial.join(", ")}.` : `Partial (partners still reporting): ${partial.join(", ")}.`);
  parts.push(es ? "Comtrade se arma con lo que declaran los socios comerciales; cada país reporta con 6 a 18 meses de rezago." : "Built from what trading partners declare; each reports with a 6–18 month lag.");
  return parts.join(" ");
}

export default async function CategoryPage({ params }: { params: { lang: Lang; cat: string } }) {
  const { lang } = params;
  if (!(CATEGORIES as readonly string[]).includes(params.cat)) notFound();
  const cat = params.cat as Category;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const series = await latest(cat);
  const hist = await history([...series.map((s) => s.code), ...(cat === "precios" ? [] : [])], 45);
  const [bnd, ranking, sample, system, fxb] = await Promise.all([cat === "deuda" ? bonds() : null, cat === "banca" ? bankRanking() : [], cat === "banca" ? bankSample() : [],
    cat === "banca" ? bankSystem() : [], cat === "banca" ? history(["usd_bcv"], 5) : Promise.resolve({} as Record<string, [string, number][]>)]);
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  const featured = cat === "cambiario" ? ["usd_bcv", "usd_paralelo", "eur_bcv", "brecha_cambiaria"] : [];
  // destacados de cada página (gráfico grande arriba de la cuadrícula)
  const lead = cat === "monetario" ? "multiplicador" : cat === "externo" ? "reservas_internacionales" : null;
  const rest = series.filter((s) => (!featured.includes(s.code) || s.code === "brecha_cambiaria") && !(cat === "cambiario" && ["usd_paralelo", "eur_bcv"].includes(s.code))
    && s.code !== lead
    && !HIDDEN.has(s.code) && s.code !== "embi_venezuela"
    // series automáticas que todavía no tienen ningún dato no se muestran (sí en Metodología)
    && ((hist[s.code] ?? []).length > 0 || s.method !== "auto"));
  if (cat === "cambiario") rest.sort((x, y) => (x.code === "brecha_cambiaria" ? -1 : y.code === "brecha_cambiaria" ? 1 : 0));
  // sector externo: primero lo más reciente; la balanza de pagos del BCV (con meses de rezago) queda en «Ver más»
  if (cat === "externo") rest.sort((x, y) => (y.last_date ?? "").localeCompare(x.last_date ?? ""));
  if (cat === "precios") rest.sort((x, y) => (x.code === "inflacion_mensual" ? -1 : y.code === "inflacion_mensual" ? 1 : 0));
  const BOP = new Set(["cuenta_corriente", "exportaciones_bienes", "exportaciones_petroleras", "exportaciones_no_petroleras", "importaciones_bienes", "transferencias_corrientes", "inversion_directa_pais"]);
  const note = (code: string) => code.endsWith("_espejo") ? mirrorNote(hist[code] ?? [], lang === "es") : NOTES[code]?.[lang]
    ?? (BOP.has(code) ? (lang === "es" ? "Balanza de pagos del BCV, en millones de US$ por trimestre. El BCV la publica con unos 6 meses de rezago: el último trimestre disponible es el que se muestra." : "BCV balance of payments, US$ million per quarter. The BCV publishes it with about a 6-month lag: the latest available quarter is shown.") : undefined);
  const infl2026 = cat === "precios" ? cumulative(hist.inflacion_mensual ?? [], "2026-01") : [];
  // inflación de EE.UU. interanual (para comparar con la inflación en dólares)
  const cpi = hist.ipc_eeuu ?? [];
  const usInfl = cpi.map(([d, v]) => { const y = valueAt(cpi, `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`); return y && y[0].slice(0, 7) === `${Number(d.slice(0, 4)) - 1}${d.slice(4, 7)}` ? [d, (v / y[1] - 1) * 100] as [string, number] : null; }).filter(Boolean) as [string, number][];
  // producción: EIA hasta dic-2024 y fuente primaria (comunicación directa a la OPEP) desde ene-2025
  const prod = [...(hist.petroleo_prod_eia ?? []).filter((p) => p[0] < "2025-01-01"), ...(hist.petroleo_prod_opep_cd ?? []).filter((p) => p[0] >= "2025-01-01")];
  const es = lang === "es";
  const VISIBLE = cat === "commodities" ? 6 : VISIBLE_DEF;
  const gcls = cat === "commodities" ? "g3" : "g2";
  const ch = cat === "commodities" ? 170 : undefined;

  const card = (x: Latest) => <SeriesCard key={x.code} s={x} points={hist[x.code] ?? []} lang={lang} bars={BARS.has(x.code)} height={ch}
    allowLog={LOG.has(x.code)} note={note(x.code)} ranges={RANGES[x.code]} initial={INITIAL[x.code]} hiLo={HILO.has(x.code)} />;
  const combo = (c: Combo) => {
    const ser = c.codes.filter((k) => (hist[k] ?? []).length).map((k) => ({ name: by[k] ? (es ? by[k].name_es : by[k].name_en).replace(/ \(anual\)| en US\$| \(% del PIB\)/g, "") : k, points: hist[k] ?? [] }));
    const lastD = ser.map((x) => x.points.at(-1)?.[0] ?? "").sort().at(-1);
    return <ChartCard key={c.id} id={c.id} lang={lang} title={es ? c.es : c.en} date={lastD ? (c.annual ? lastD.slice(0, 4) : lastD.slice(0, 7)) : ""} unit={es ? c.unit_es : c.unit_en}
      decimals={c.decimals} height={250} labels={chartLabels(lang)} rangeLabels={d.range} ranges={c.annual ? [] : ["1A", "MAX"]} initial="MAX"
      bars={c.mode !== "line"} stack={c.mode === "stack"} series={ser}
      footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{(es ? c.note_es : c.note_en) ?? ""}{(es ? c.note_es : c.note_en) ? " " : ""}{es ? `En ${c.unit_es}.` : `In ${c.unit_en}.`}</p>} />;
  };
  const groups = GROUPS[cat] ? (() => {
    const defs = GROUPS[cat]!;
    const pick = (x: Latest) => { const i = defs.findIndex((g) => g.rx.test(x.code)); return i < 0 ? defs.length - 1 : i; };
    const all = [...rest, ...series.filter((x) => HIDDEN.has(x.code) && COMBOS.some((c) => c.codes.includes(x.code)))];
    return defs.map((g, i) => {
      const combos = COMBOS.filter((c) => c.group === g.id && c.codes.filter((k) => (hist[k] ?? []).length).length >= 2);
      const inCombo = new Set(combos.flatMap((c) => c.codes));
      const mine = all.filter((x) => pick(x) === i);
      return { id: g.id, label: es ? g.es : g.en, combos,
        cards: mine.filter((x) => !inCombo.has(x.code) && !HIDDEN.has(x.code)), covered: mine.filter((x) => inCombo.has(x.code)) };
    }).filter((g) => g.cards.length + g.combos.length > 0);
  })() : null;
  // noticias recientes del tema de la página (la misma lista en caché que usa la portada: no suma consultas)
  const rx = TOPIC_RX[cat];
  const related = rx ? groupNews((await news(150, undefined, lang)).filter((n) => n.category !== "global" && rx.test(n.title))).slice(0, 5) : [];

  return (
    <>
      <MacroNav lang={lang} />
      <div className="head-row">
        <div><h1>{d.cat[cat]}</h1><p className="sub">{INTRO[cat][lang]}</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          <a className="btn" href={`/api/export?category=${cat}&format=xlsx&lang=${lang}`}>⬇ Excel</a>
          <a className="btn" href={`/api/export?category=${cat}&format=csv&lang=${lang}`}>CSV</a>
          {series.some((x) => ["Bs", "miles de Bs", "millones Bs"].includes(x.unit_es ?? "")) && <a className="btn" href={`/api/export?category=${cat}&format=xlsx&lang=${lang}&cur=bcv`}>⬇ Excel en US$</a>}
        </div>
      </div>

      {cat === "cambiario" && (
        <>
          <div className="grid g4">{featured.filter((c) => by[c]).map((c) => <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} />)}</div>
          <div className="section">
          <ChartCard lang={lang} title={es ? "Dólar oficial, mercado alternativo y euro oficial" : "Official dollar, alternative market and official euro"} date="Bs" decimals={2} height={340}
            allowLog labels={chartLabels(lang)} rangeLabels={d.range} initial="1A" gap={{ a: 0, b: 1, label: es ? "Brecha" : "Gap" }}
            series={[{ name: es ? "US$ oficial BCV" : "US$ official (BCV)", points: hist.usd_bcv ?? [] }, { name: es ? "US$ alternativo" : "US$ alternative", points: hist.usd_paralelo ?? [] },
              { name: es ? "Euro oficial BCV" : "Euro official (BCV)", points: hist.eur_bcv ?? [] }]}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{es
              ? "Todo en bolívares de hoy: los valores anteriores a las reconversiones de 2008, 2018 y 2021 están reexpresados (por eso antes de 2021 se ven tan pequeños; use la escala logarítmica). Oficial desde 2000 (Fed/FRED y BCV); mercado alternativo diario desde 2022."
              : "All in today's bolivars: values before the 2008, 2018 and 2021 redenominations are re-expressed (hence tiny before 2021; use log scale). Official since 2000 (Fed/FRED and BCV); daily alternative market since 2022."}</p>} />
          </div>
        </>
      )}

      {cat === "deuda" && by.embi_venezuela && (
        <div style={{ marginBottom: 20 }}>
          <SeriesCard s={by.embi_venezuela} points={hist.embi_venezuela ?? []} lang={lang} height={300} initial="YTD" note={note("embi_venezuela")} />
        </div>
      )}

      {cat === "deuda" && bnd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-top"><h3>{es ? "Bonos VENZ y PDVSA · último cierre" : "VENZ and PDVSA bonds · last close"}</h3><span className="date">{es ? "% del nominal" : "% of par"}</span></div>
          <BondsTable lang={lang} list={bnd.list} prices={bnd.prices} />
        </div>
      )}

      {cat === "banca" && (
        <div style={{ marginBottom: 20 }}>
          <BankExplorer rows={sample} system={system} fx={(fxb.usd_bcv ?? []) as [string, number][]} lang={lang} labels={chartLabels(lang)} rangeLabels={d.range} />
        </div>
      )}

      {cat === "petroleo" && (
        <div style={{ marginBottom: 20 }}>
          <ChartCard lang={lang} title={es ? "Producción de crudo de Venezuela" : "Venezuela crude output"} date={es ? "miles b/d" : "kb/d"} decimals={0} height={320}
            labels={chartLabels(lang)} rangeLabels={d.range} initial="MAX" unit={es ? "miles b/d" : "kb/d"} area
            series={[{ name: es ? "Producción de crudo" : "Crude output", points: prod }]}
            stats={{ periods: ["PREV", "YTD", "YOY"], points: prod }}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{es
              ? `Desde enero de 2025: cifra oficial que Venezuela comunica a la OPEP (fuente primaria, informe mensual MOMR). Hasta diciembre de 2024: EIA, para la historia larga desde ${prod[0]?.[0].slice(0, 4) ?? "1973"}. Último dato: ${prod.at(-1)?.[0] ?? "—"}.`
              : `From January 2025: Venezuela's official figure reported to OPEC (primary source, MOMR). Through December 2024: EIA, for the long history since ${prod[0]?.[0].slice(0, 4) ?? "1973"}. Latest: ${prod.at(-1)?.[0] ?? "—"}.`}</p>} />
        </div>
      )}

      {cat === "precios" && infl2026.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ChartCard lang={lang} title={es ? "Inflación acumulada desde el 1 de enero de 2026" : "Cumulative inflation since 1 January 2026"} date="%" decimals={1} height={260}
            labels={chartLabels(lang)} rangeLabels={d.range} ranges={[]} initial="MAX" unit="%" bars
            series={[{ name: es ? "Acumulada desde ene-2026" : "Cumulative since Jan-2026", points: infl2026 }]}>
            <div className="big">{num(infl2026.at(-1)?.[1], lang, 1)}<small>%</small></div>
          </ChartCard>
        </div>
      )}

      {lead && by[lead] && (
        <div style={{ marginBottom: 20 }}>
          <SeriesCard s={by[lead]} points={hist[lead] ?? []} lang={lang} height={320} initial={lead === "reservas_internacionales" ? "1A" : undefined} allowLog={lead === "reservas_internacionales"}
            note={note(lead) ?? (lead === "reservas_internacionales" ? (es ? "Reservas internacionales del BCV en millones de US$, dato diario. Es el colchón en divisas del país: respalda la intervención cambiaria y la capacidad de pago externo." : "BCV international reserves, US$ million, daily. The country's FX cushion: it backs FX intervention and external payment capacity.") : es
            ? "Cuántos bolívares de liquidez (M2) genera cada bolívar de base monetaria. Si sube, los bancos están prestando más por cada bolívar que emite el BCV; si baja, el encaje o la cautela bancaria frenan la creación de dinero."
            : "How many bolivars of money supply (M2) each bolivar of monetary base generates. Rising means banks lend more per bolivar issued by the BCV; falling means reserve requirements or bank caution are curbing money creation.")} />
        </div>
      )}

      {groups ? (
        <Tabs tabs={groups.map((g) => ({ id: g.id, label: g.label, count: g.cards.length + g.combos.length }))}>
          {groups.map((g) => (
            <div key={g.id}>
              {g.combos.length > 0 && <div className={`grid ${gcls}`} style={{ marginBottom: 20 }}>{g.combos.map(combo)}</div>}
              <div className={`grid ${gcls}`}>{g.cards.map(card)}</div>
              {g.covered.length > 0 && (
                <details className="card fold" style={{ marginTop: 20 }}>
                  <summary><h3 style={{ display: "inline" }}>{es ? `Ver cada serie por separado (${g.covered.length})` : `Show each series separately (${g.covered.length})`}</h3>
                    <span className="muted"> · {es ? "con su tabla, variaciones y descarga" : "with table, changes and download"}</span></summary>
                  <div className={`grid ${gcls}`}>{g.covered.map(card)}</div>
                </details>
              )}
            </div>
          ))}
        </Tabs>
      ) : (
        <>
          {/* para no tener que bajar tanto: se ven 4 tarjetas y el resto queda en un desplegable */}
          <div className={`grid ${gcls} ${cat === "cambiario" ? "section" : ""}`}>{rest.slice(0, VISIBLE).map(card)}</div>
          {rest.length > VISIBLE && (
            <details className="card fold" style={{ marginTop: 20 }}>
              <summary><h3 style={{ display: "inline" }}>{es ? `Ver ${rest.length - VISIBLE} indicadores más` : `Show ${rest.length - VISIBLE} more indicators`}</h3>
                <span className="muted"> · {rest.slice(VISIBLE).map((x) => (es ? x.name_es : x.name_en)).slice(0, 4).join(", ")}{rest.length - VISIBLE > 4 ? "…" : ""}</span></summary>
              <div className={`grid ${gcls}`}>{rest.slice(VISIBLE).map(card)}</div>
            </details>
          )}
        </>
      )}

      {cat === "precios" && usInfl.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <ChartCard lang={lang} title={es ? "Inflación en dólares (EE.UU., interanual)" : "Dollar inflation (US, year on year)"} date="%" decimals={1} height={220}
            labels={chartLabels(lang)} rangeLabels={d.range} ranges={["1A", "MAX"]} initial="1A" unit="%"
            series={[{ name: es ? "IPC de EE.UU., var. interanual" : "US CPI, y/y", points: usInfl }]}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{es ? `Pérdida de poder de compra del dólar. Fuente: BLS (IPC de EE.UU.), último dato ${usInfl.at(-1)?.[0].slice(0, 7)}.` : `Loss of the dollar's purchasing power. Source: BLS (US CPI), latest ${usInfl.at(-1)?.[0].slice(0, 7)}.`}</p>}>
            <div className="big">{num(usInfl.at(-1)?.[1], lang, 1)}<small>%</small></div>
          </ChartCard>
        </div>
      )}


      {cat === "banca" && ranking.length > 0 && (
        <section className="section">
          <SectionHead label={es ? `Ranking bancario · ${ranking[0].period.slice(0, 7)}` : `Bank ranking · ${ranking[0].period.slice(0, 7)}`} />
          <div className="grid g2">
            {(["creditos", "captaciones"] as const).map((m) => (
              <div className="card" key={m}>
                <div className="card-top"><h3>{m === "creditos" ? (es ? "Cartera de créditos" : "Loan book") : (es ? "Captaciones" : "Deposits")}</h3><span className="date">{es ? "millones Bs · % del sistema" : "Bs million · system share"}</span></div>
                <div style={{ marginTop: 14 }}>
                  <BarList lang={lang} items={ranking.filter((r) => r.metric === m).slice(0, 15).map((r) => ({ name: `${r.bank}${r.share != null ? ` · ${num(r.share, lang, 1)}%` : ""}`, value: r.value }))} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {related.length > 0 && (
        <section className="section">
          <SectionHead label={es ? "Noticias relacionadas" : "Related news"} href={`/${lang}/noticias`} more={es ? "Todas las noticias" : "All news"} />
          <div className="card" style={{ paddingTop: 8 }}>
            <ul className="headlines" style={{ borderTop: 0 }}>
              {related.map((n) => (
                <li key={n.id}>
                  <div className="m"><span>{n.source} · {new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Caracas" }).format(new Date(n.published_at))}</span></div>
                  <a className="t" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                  {n.also.length > 0 && <p className="also">{es ? "También en: " : "Also in: "}{n.also.slice(0, 4).map((a, k) => <span key={a.url}>{k > 0 && " · "}<a href={a.url} target="_blank" rel="noreferrer">{a.source}</a></span>)}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
