import { notFound } from "next/navigation";
import BondsTable from "@/components/BondsTable";
import ChartCard from "@/components/ChartCard";
import MacroNav from "@/components/MacroNav";
import { BarList, chartLabels, Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { bankRanking, bankSample, bonds, configured, history, latest } from "@/lib/data";
import BankExplorer from "@/components/BankExplorer";
import { num } from "@/lib/format";
import { cumulative } from "@/lib/stats";
import { CATEGORIES, LANGS, t, type Category, type Lang } from "@/lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CATEGORIES.map((cat) => ({ lang, cat })));
}

const INTRO: Record<Category, { es: string; en: string }> = {
  cambiario: { es: "Dólar oficial del BCV por fecha valor, dólar paralelo de Binance P2P, brecha e intervención cambiaria.", en: "BCV official rate by value date, Binance P2P parallel rate, gap and FX intervention." },
  monetario: { es: "Liquidez (M1 y M2) desde 1997, base monetaria desde 2001, multiplicador y encaje (BCV). Saldos en miles de bolívares actuales: use escala log para ver toda la serie.", en: "Money (M1, M2) since 1997, monetary base since 2001, multiplier and reserve requirement (BCV). Balances in thousand current bolivars: use log scale for the full series." },
  precios: { es: "Inflación oficial del BCV (INPC), serie mensual desde 1986.", en: "BCV official inflation (CPI), monthly series since 1986." },
  externo: { es: "Reservas internacionales (desde 1996), balanza de pagos trimestral del BCV (desde 1997), exportaciones petroleras mensuales, comercio mensual con EE.UU. (Census, casi al día) y comercio exterior espejo.", en: "International reserves (since 1996), BCV quarterly balance of payments (since 1997), monthly oil exports, monthly trade with the US (Census, near real time) and mirror trade." },
  banca: { es: "Cartera de créditos y captaciones del sistema bancario, en bolívares y en dólares, y ranking por banco.", en: "Banking system loans and deposits in bolivars and dollars, and bank ranking." },
  petroleo: { es: "Producción de crudo (OPEP y EIA), cesta Merey y precios de referencia.", en: "Crude output (OPEC and EIA), Merey basket and benchmark prices." },
  mercados: { es: "Índices y volúmenes de la Bolsa de Valores de Caracas y BOLPRIAVEN.", en: "Caracas Stock Exchange and BOLPRIAVEN indices and volumes." },
  actividad: { es: "PIB real del BCV (trimestral y anual, total, petrolero y no petrolero) y recaudación del SENIAT.", en: "BCV real GDP (quarterly and annual; total, oil and non-oil) and SENIAT tax collection." },
  deuda: { es: "Bonos de la República y de PDVSA (precio en % del valor nominal).", en: "Republic and PDVSA bonds (price as % of par)." },
  commodities: { es: "Precios internacionales de materias primas relevantes para Venezuela (Banco Mundial, desde 1960).", en: "International prices of commodities relevant to Venezuela (World Bank, since 1960)." },
};
const BARS = new Set(["eeuu_importa_de_ve", "eeuu_importa_petroleo_ve", "eeuu_exporta_a_ve", "exportaciones_petroleras_bd", "intervencion_bcv_mensual", "intervencion_bcv", "inflacion_mensual", "mob_monto", "mob_operaciones", "bvc_volumen_usd",
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
  eeuu_importa_de_ve: { es: "Lo que EE.UU. compra a Venezuela cada mes según su aduana (Census). Sirve como termómetro mensual de las exportaciones mientras el BCV publica la balanza por trimestre.", en: "What the US buys from Venezuela each month per US customs (Census): a monthly gauge of exports while the BCV publishes quarterly." },
  exportaciones_petroleras_bd: { es: "Barriles diarios embarcados en el mes según los datos de seguimiento de buques que publica Reuters a inicios de cada mes.", en: "Barrels per day shipped in the month, per the tanker-tracking data Reuters publishes early each month." },
  pib_real_var: { es: "El BCV publica el PIB solo por trimestre: no existe una cifra oficial mensual.", en: "The BCV publishes GDP only quarterly: there is no official monthly figure." },
};
const HIDDEN = new Set(["petroleo_prod_opep_fs", "petroleo_prod_opep_cd", "petroleo_prod_eia"]);

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
  const [bnd, ranking, sample] = await Promise.all([cat === "deuda" ? bonds() : null, cat === "banca" ? bankRanking() : [], cat === "banca" ? bankSample() : []]);
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  const featured = cat === "cambiario" ? ["usd_bcv", "usd_paralelo", "brecha_cambiaria"] : [];
  const rest = series.filter((s) => !featured.includes(s.code) && !(cat === "cambiario" && ["usd_paralelo", "eur_bcv"].includes(s.code))
    && !(cat === "petroleo" && HIDDEN.has(s.code)));
  const note = (code: string) => code.endsWith("_espejo") ? mirrorNote(hist[code] ?? [], lang === "es") : NOTES[code]?.[lang];
  const infl2026 = cat === "precios" ? cumulative(hist.inflacion_mensual ?? [], "2026-01") : [];
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
          <ChartCard lang={lang} title={es ? "Dólar oficial, dólar paralelo y euro oficial" : "Official dollar, parallel dollar and official euro"} date="Bs" decimals={2} height={340}
            allowLog labels={chartLabels(lang)} rangeLabels={d.range} initial="1A"
            series={[{ name: es ? "US$ oficial BCV" : "US$ official (BCV)", points: hist.usd_bcv ?? [] }, { name: es ? "US$ paralelo" : "US$ parallel", points: hist.usd_paralelo ?? [] },
              { name: es ? "Euro oficial BCV" : "Euro official (BCV)", points: hist.eur_bcv ?? [] }]}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{es
              ? "Todo en bolívares de hoy: los valores anteriores a las reconversiones de 2008, 2018 y 2021 están reexpresados (por eso antes de 2021 se ven tan pequeños; use la escala logarítmica). Oficial desde 2000 (Fed/FRED y BCV); paralelo diario desde 2022."
              : "All in today's bolivars: values before the 2008, 2018 and 2021 redenominations are re-expressed (hence tiny before 2021; use log scale). Official since 2000 (Fed/FRED and BCV); daily parallel since 2022."}</p>} />
          </div>
        </>
      )}

      {cat === "deuda" && bnd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-top"><h3>{es ? "Bonos VENZ y PDVSA · último cierre" : "VENZ and PDVSA bonds · last close"}</h3><span className="date">{es ? "% del nominal" : "% of par"}</span></div>
          <BondsTable lang={lang} list={bnd.list} prices={bnd.prices} />
        </div>
      )}

      {cat === "banca" && (
        <div style={{ marginBottom: 20 }}>
          <BankExplorer rows={sample} lang={lang} labels={chartLabels(lang)} rangeLabels={d.range} />
        </div>
      )}

      {cat === "petroleo" && (
        <div style={{ marginBottom: 20 }}>
          <ChartCard lang={lang} title={es ? "Producción de crudo de Venezuela" : "Venezuela crude output"} date={es ? "miles b/d" : "kb/d"} decimals={0} height={320}
            labels={chartLabels(lang)} rangeLabels={d.range} initial="MAX" unit={es ? "miles b/d" : "kb/d"}
            series={[{ name: es ? "Fuente primaria (comunicación directa a la OPEP)" : "Primary source (direct communication to OPEC)", points: hist.petroleo_prod_opep_cd ?? [] },
              { name: es ? "EIA (serie larga, desde 1973)" : "EIA (long series, since 1973)", points: hist.petroleo_prod_eia ?? [] }]}
            stats={{ periods: ["PREV", "YTD", "YOY"], points: hist.petroleo_prod_opep_cd ?? [] }}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{es
              ? "La línea principal es la cifra oficial que Venezuela comunica a la OPEP (informe mensual MOMR). La de la EIA sirve para ver la historia larga; difieren en metodología."
              : "The main line is Venezuela's official figure reported to OPEC (MOMR). The EIA line gives the long history; methodologies differ."}</p>} />
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

      <div className={`grid g2 ${cat === "cambiario" ? "section" : ""}`}>
        {rest.map((s) => <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} bars={BARS.has(s.code)}
          allowLog={LOG.has(s.code) || s.code === "inflacion_acumulada"} logDefault={s.code === "inflacion_acumulada"} note={note(s.code)} />)}
      </div>

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
    </>
  );
}
