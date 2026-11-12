import { notFound } from "next/navigation";
import BondsTable from "@/components/BondsTable";
import ChartCard from "@/components/ChartCard";
import MacroNav from "@/components/MacroNav";
import { BarList, chartLabels, Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { bankRanking, bankSample, bankSystem, bonds, configured, history, latest } from "@/lib/data";
import BankExplorer from "@/components/BankExplorer";
import AgroBody from "@/components/AgroBody";
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
  externo: { es: "Reservas internacionales (desde 1996), balanza de pagos trimestral del BCV (desde 1997), exportaciones petroleras mensuales, comercio mensual con EE.UU. (Census, casi al día) y comercio exterior espejo.", en: "International reserves (since 1996), BCV quarterly balance of payments (since 1997), monthly oil exports, monthly trade with the US (Census, near real time) and mirror trade." },
  banca: { es: "Cartera de créditos y captaciones del sistema bancario, en bolívares y en dólares, y ranking por banco.", en: "Banking system loans and deposits in bolivars and dollars, and bank ranking." },
  petroleo: { es: "Producción de crudo (OPEP y EIA), cesta Merey y precios de referencia.", en: "Crude output (OPEC and EIA), Merey basket and benchmark prices." },
  mercados: { es: "Índices y volúmenes de la Bolsa de Valores de Caracas y BOLPRIAVEN.", en: "Caracas Stock Exchange and BOLPRIAVEN indices and volumes." },
  actividad: { es: "PIB real del BCV (trimestral y anual, total, petrolero y no petrolero) y recaudación del SENIAT.", en: "BCV real GDP (quarterly and annual; total, oil and non-oil) and SENIAT tax collection." },
  deuda: { es: "Riesgo país (EMBI de JPMorgan) y bonos de la República y de PDVSA (precio en % del valor nominal).", en: "Country risk (JPMorgan EMBI) and Republic and PDVSA bonds (price as % of par)." },
  commodities: { es: "Precios internacionales de materias primas relevantes para Venezuela (Banco Mundial, desde 1960).", en: "International prices of commodities relevant to Venezuela (World Bank, since 1960)." },
};
const BARS = new Set(["exportaciones_espejo_mensual", "exportaciones_petroleras_espejo_mensual", "importaciones_espejo_mensual", "eeuu_importa_crudo_ve_bd", "eeuu_importa_de_ve", "eeuu_importa_petroleo_ve", "eeuu_exporta_a_ve", "exportaciones_petroleras_bd", "intervencion_bcv_mensual", "intervencion_bcv", "inflacion_mensual", "mob_monto", "mob_operaciones", "bvc_volumen_usd",
  "bolpriaven_monto", "recaudacion_seniat", "recaudacion_seniat_usd", "pib_real_var", "exportaciones_espejo", "importaciones_espejo",
  "pib_petrolero_var", "pib_no_petrolero_var", "pib_anual_var", "pib_petrolero_anual_var", "pib_no_petrolero_anual_var", "cuenta_corriente",
  "exportaciones_bienes", "exportaciones_petroleras", "exportaciones_no_petroleras", "importaciones_bienes", "transferencias_corrientes", "inversion_directa_pais"]);
const LOG = new Set(["usd_bcv", "usd_paralelo", "eur_bcv", "liquidez_m2", "dinero_m1", "base_monetaria", "inflacion_interanual", "cartera_credito", "depositos_totales", "ibc"]);

const NOTES: Record<string, { es: string; en: string }> = {
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
  pib_real_var: { es: "El BCV publica el PIB solo por trimestre: no existe una cifra oficial mensual. El III trimestre de 2026 (6,6%) es el anuncio preliminar de la Presidencia del 3 de noviembre; se reemplaza solo cuando el BCV publique su archivo.", en: "The BCV publishes GDP only quarterly: there is no official monthly figure. Q3 2026 (6.6%) is the preliminary figure announced by the Presidency on November 3; it is replaced automatically once the BCV publishes its file." },
};
const HIDDEN = new Set(["taladros_venezuela", "petroleo_prod_opep_fs", "petroleo_prod_opep_cd", "petroleo_prod_eia", "intervencion_bcv", "inflacion_acumulada", "ipc_eeuu"]);
/** Rango por tarjeta cuando el estándar (1M…Máx) no aplica. */
const RANGES: Record<string, Range[]> = {
  inflacion_mensual: ["YTD", "1A", "MAX"], inflacion_interanual: ["1A"], merey: [], intervencion_bcv_mensual: ["1A", "MAX"],
};
const INITIAL: Record<string, Range> = { inflacion_interanual: "1A", merey: "MAX", intervencion_bcv_mensual: "1A" };
const HILO = new Set(["brent", "wti", "henry_hub", "oro", "plata", "cobre", "aluminio", "mineral_hierro", "cafe", "cacao", "azucar", "maiz_cbot", "trigo_kc", "soya_cbot", "embi_venezuela"]);

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
  // Petróleo y materias primas: materias primas y agro van como desplegables debajo del petróleo
  const comm = cat === "petroleo" ? await latest("commodities") : [];
  const commHist = comm.length ? await history(comm.map((s) => s.code), 45) : {};
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  const featured = cat === "cambiario" ? ["usd_bcv", "usd_paralelo", "brecha_cambiaria"] : [];
  // destacados de cada página (gráfico grande arriba de la cuadrícula)
  const lead = cat === "monetario" ? "multiplicador" : null;
  const rest = series.filter((s) => (!featured.includes(s.code) || s.code === "brecha_cambiaria") && !(cat === "cambiario" && ["usd_paralelo", "eur_bcv"].includes(s.code))
    && s.code !== lead
    && !HIDDEN.has(s.code) && s.code !== "embi_venezuela"
    // series automáticas que todavía no tienen ningún dato no se muestran (sí en Metodología)
    && ((hist[s.code] ?? []).length > 0 || s.method !== "auto"));
  if (cat === "cambiario") rest.sort((x, y) => (x.code === "brecha_cambiaria" ? -1 : y.code === "brecha_cambiaria" ? 1 : 0));
  const note = (code: string) => code.endsWith("_espejo") ? mirrorNote(hist[code] ?? [], lang === "es") : NOTES[code]?.[lang];
  const infl2026 = cat === "precios" ? cumulative(hist.inflacion_mensual ?? [], "2026-01") : [];
  // inflación de EE.UU. interanual (para comparar con la inflación en dólares)
  const cpi = hist.ipc_eeuu ?? [];
  const usInfl = cpi.map(([d, v]) => { const y = valueAt(cpi, `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`); return y && y[0].slice(0, 7) === `${Number(d.slice(0, 4)) - 1}${d.slice(4, 7)}` ? [d, (v / y[1] - 1) * 100] as [string, number] : null; }).filter(Boolean) as [string, number][];
  // producción: EIA hasta dic-2024 y fuente primaria (comunicación directa a la OPEP) desde ene-2025
  const prod = [...(hist.petroleo_prod_eia ?? []).filter((p) => p[0] < "2025-01-01"), ...(hist.petroleo_prod_opep_cd ?? []).filter((p) => p[0] >= "2025-01-01")];
  const es = lang === "es";

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
          <div className="grid g3">{featured.map((c) => <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} />)}</div>
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
          <SeriesCard s={by[lead]} points={hist[lead] ?? []} lang={lang} height={320} note={note(lead) ?? (es
            ? "Cuántos bolívares de liquidez (M2) genera cada bolívar de base monetaria. Si sube, los bancos están prestando más por cada bolívar que emite el BCV; si baja, el encaje o la cautela bancaria frenan la creación de dinero."
            : "How many bolivars of money supply (M2) each bolivar of monetary base generates. Rising means banks lend more per bolivar issued by the BCV; falling means reserve requirements or bank caution are curbing money creation.")} />
        </div>
      )}

      <div className={`grid g2 ${cat === "cambiario" ? "section" : ""}`}>
        {rest.map((s) => <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} bars={BARS.has(s.code)}
          allowLog={LOG.has(s.code)} note={note(s.code)} ranges={RANGES[s.code]} initial={INITIAL[s.code]} hiLo={HILO.has(s.code)} />)}
      </div>

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
      {cat === "petroleo" && (
        <>
          <details className="card fold" style={{ marginTop: 24 }}>
            <summary><h3 style={{ display: "inline" }}>{es ? "Materias primas" : "Commodities"}</h3> <span className="muted">· {es ? "oro, hierro, aluminio, granos, café, cacao, fertilizantes" : "gold, iron ore, aluminum, grains, coffee, cocoa, fertilizers"}</span></summary>
            <div className="grid g2">
              {comm.filter((s) => (commHist[s.code] ?? []).length > 0).map((s) => <SeriesCard key={s.code} s={s} points={commHist[s.code] ?? []} lang={lang}
                allowLog={LOG.has(s.code)} note={note(s.code)} hiLo={HILO.has(s.code)} bars={BARS.has(s.code)} />)}
            </div>
          </details>
          <details className="card fold" style={{ marginTop: 16 }}>
            <summary><h3 style={{ display: "inline" }}>Agro</h3> <span className="muted">· {es ? "producción, importaciones y consumo por campaña (USDA)" : "production, imports and consumption by season (USDA)"}</span></summary>
            <AgroBody lang={lang} embed />
          </details>
        </>
      )}
    </>
  );
}
