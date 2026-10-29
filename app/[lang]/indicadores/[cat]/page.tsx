import { notFound } from "next/navigation";
import BondsTable from "@/components/BondsTable";
import LineChart from "@/components/LineChart";
import MacroNav from "@/components/MacroNav";
import { BarList, chartLabels, Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { bankRanking, bonds, configured, history, latest } from "@/lib/data";
import { num } from "@/lib/format";
import { CATEGORIES, LANGS, t, type Category, type Lang } from "@/lib/i18n";

export const revalidate = 300;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CATEGORIES.map((cat) => ({ lang, cat })));
}

const INTRO: Record<Category, { es: string; en: string }> = {
  cambiario: { es: "Dólar oficial del BCV por fecha valor, dólar paralelo de Binance P2P, brecha e intervención cambiaria.", en: "BCV official rate by value date, Binance P2P parallel rate, gap and FX intervention." },
  monetario: { es: "Liquidez (M1 y M2) desde 1997, base monetaria desde 2001, multiplicador y encaje (BCV). Saldos en miles de bolívares actuales: use escala log para ver toda la serie.", en: "Money (M1, M2) since 1997, monetary base since 2001, multiplier and reserve requirement (BCV). Balances in thousand current bolivars: use log scale for the full series." },
  precios: { es: "Inflación oficial del BCV (INPC), serie mensual desde 1986.", en: "BCV official inflation (CPI), monthly series since 1986." },
  externo: { es: "Reservas internacionales (desde 1996), balanza de pagos trimestral del BCV (desde 1997) y comercio exterior espejo.", en: "International reserves (since 1996), BCV quarterly balance of payments (since 1997) and mirror trade." },
  banca: { es: "Cartera de créditos y captaciones del sistema bancario, en bolívares y en dólares, y ranking por banco.", en: "Banking system loans and deposits in bolivars and dollars, and bank ranking." },
  petroleo: { es: "Producción de crudo (OPEP y EIA), cesta Merey y precios de referencia.", en: "Crude output (OPEC and EIA), Merey basket and benchmark prices." },
  mercados: { es: "Índices y volúmenes de la Bolsa de Valores de Caracas y BOLPRIAVEN.", en: "Caracas Stock Exchange and BOLPRIAVEN indices and volumes." },
  actividad: { es: "PIB real del BCV (trimestral y anual, total, petrolero y no petrolero) y recaudación del SENIAT.", en: "BCV real GDP (quarterly and annual; total, oil and non-oil) and SENIAT tax collection." },
  deuda: { es: "Bonos de la República y de PDVSA (precio en % del valor nominal).", en: "Republic and PDVSA bonds (price as % of par)." },
  commodities: { es: "Precios internacionales de materias primas relevantes para Venezuela (Banco Mundial, desde 1960).", en: "International prices of commodities relevant to Venezuela (World Bank, since 1960)." },
};
const BARS = new Set(["intervencion_bcv_mensual", "intervencion_bcv", "inflacion_mensual", "mob_monto", "mob_operaciones", "bvc_volumen_usd",
  "bolpriaven_monto", "recaudacion_seniat", "recaudacion_seniat_usd", "pib_real_var", "exportaciones_espejo", "importaciones_espejo",
  "pib_petrolero_var", "pib_no_petrolero_var", "pib_anual_var", "pib_petrolero_anual_var", "pib_no_petrolero_anual_var", "cuenta_corriente",
  "exportaciones_bienes", "exportaciones_petroleras", "exportaciones_no_petroleras", "importaciones_bienes", "transferencias_corrientes", "inversion_directa_pais"]);
const LOG = new Set(["usd_bcv", "usd_paralelo", "eur_bcv", "liquidez_m2", "dinero_m1", "base_monetaria", "inflacion_interanual", "cartera_credito", "depositos_totales", "ibc"]);

export default async function CategoryPage({ params }: { params: { lang: Lang; cat: string } }) {
  const { lang } = params;
  if (!(CATEGORIES as readonly string[]).includes(params.cat)) notFound();
  const cat = params.cat as Category;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const series = await latest(cat);
  const hist = await history(series.map((s) => s.code), 45);
  const [bnd, ranking] = await Promise.all([cat === "deuda" ? bonds() : null, cat === "banca" ? bankRanking() : []]);
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  const featured = cat === "cambiario" ? ["usd_bcv", "usd_paralelo", "brecha_cambiaria"] : [];
  const rest = series.filter((s) => !featured.includes(s.code) && !(cat === "cambiario" && s.code === "usd_paralelo"));
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
          <div className="card section">
            <div className="card-top"><h3>{d.oficialVsParalelo}</h3><span className="date">Bs/US$</span></div>
            <LineChart lang={lang} decimals={2} height={340} allowLog labels={chartLabels(lang)}
              series={[{ name: es ? "Oficial BCV" : "Official (BCV)", points: hist.usd_bcv ?? [] }, { name: es ? "Paralelo (Binance P2P)" : "Parallel (Binance P2P)", points: hist.usd_paralelo ?? [] }]} />
            <p className="muted" style={{ marginTop: 10 }}>{es ? "Desde la reconversión monetaria de octubre de 2021 (elija Máx). Brecha = paralelo ÷ oficial − 1." : "Since the October 2021 redenomination (choose Max). Gap = parallel ÷ official − 1."}</p>
          </div>
        </>
      )}

      {cat === "deuda" && bnd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-top"><h3>{es ? "Bonos VENZ y PDVSA · último cierre" : "VENZ and PDVSA bonds · last close"}</h3><span className="date">{es ? "% del nominal" : "% of par"}</span></div>
          <BondsTable lang={lang} list={bnd.list} prices={bnd.prices} />
        </div>
      )}

      <div className={`grid g2 ${cat === "cambiario" ? "section" : ""}`}>
        {rest.map((s) => <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} bars={BARS.has(s.code)} allowLog={LOG.has(s.code)} />)}
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
