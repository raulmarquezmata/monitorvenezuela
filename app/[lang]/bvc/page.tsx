import Link from "next/link";
import QuoteTable from "@/components/QuoteTable";
import ChartCard from "@/components/ChartCard";
import { CardControls, CardScope } from "@/components/CardScope";
import { chartLabels, NotConfigured, SeriesCard } from "@/components/ui";
import { change, PERIOD_LABEL, valueAt, type Period, type Point } from "@/lib/stats";
import { bvcLatest, configured, history, latest } from "@/lib/data";
import { date, num } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";


export default async function BVC({ params, searchParams }: { params: { lang: Lang }; searchParams: { m?: string; fx?: string } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const market = searchParams.m === "RF" ? "RF" : "RV";
  const fxKey = searchParams.fx === "oficial" ? "oficial" : "paralelo";
  const [quotes, idx, fx] = await Promise.all([bvcLatest(market), latest("mercados"), latest("cambiario")]);
  const hist = await history([...idx.map((s) => s.code), "usd_bcv", "usd_paralelo"], 20);
  const ibcPts = hist.ibc ?? [];
  const inUsd = (rate: Point[]) => ibcPts.map(([d, v]) => { const r = valueAt(rate, d); return r ? ([d, v / r[1]] as Point) : null; }).filter(Boolean) as Point[];
  const ret: { p: Period; bs: number | null; of: number | null; par: number | null }[] = (["1D", "1W", "1M", "YTD", "YOY"] as Period[]).map((p) => ({
    p, bs: change(ibcPts, p), of: change(inUsd(hist.usd_bcv ?? []), p), par: change(inUsd(hist.usd_paralelo ?? []), p) }));
  const pctCell = (v: number | null) => <td className={v == null ? "" : v >= 0 ? "up" : "down"} style={{ textAlign: "right" }}>{v == null ? "—" : `${v > 0 ? "+" : ""}${num(v, lang, 2)}%`}</td>;
  const ibcMeta = idx.find((x) => x.code === "ibc");
  const monto = idx.find((x) => x.code === "bvc_monto");
  const HIDE = ["ibc", "ibc_usd_paralelo", "ibc_usd", "bvc_monto"];
  const mp = hist.bvc_monto ?? [];
  const avg20 = mp.length > 5 ? mp.slice(-21, -1).reduce((a, p) => a + p[1], 0) / Math.min(20, mp.length - 1) : null;
  const vsAvg = avg20 && mp.length ? (mp[mp.length - 1][1] / avg20 - 1) * 100 : null;
  const rate = fx.find((s) => s.code === (fxKey === "oficial" ? "usd_bcv" : "usd_paralelo"))?.last_value ?? null;
  const rows = quotes.map((q) => ({ ...q, mcap_usd: q.market_cap_bs != null && rate ? q.market_cap_bs / rate : null }));
  const totalCap = rows.reduce((a, r) => a + (r.mcap_usd ?? 0), 0);
  const href = (m: string, f: string) => `/${lang}/bvc?m=${m}&fx=${f}`;
  return (
    <>
      <div className="head-row">
        <div>
          <h1>{d.nav.bvc}</h1>
          <p className="sub">
            {quotes[0] ? `${d.session} ${date(quotes[0].date, lang)} · ` : ""}
            {es ? "Datos con 15 minutos de retraso." : "Data delayed 15 minutes."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <a className="btn" href={`/api/export?bvc=${market}&format=xlsx&lang=${lang}`}>⬇ Excel</a>
          <a className="btn" href={`/api/export?bvc=${market}&format=csv&lang=${lang}`}>CSV</a>
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 24 }}>
        <ChartCard lang={lang} title={es ? "Índice Bursátil Caracas (IBC)" : "Caracas Stock Index (IBC)"} date={ibcMeta?.last_date ? date(ibcMeta.last_date, lang) : ""}
          series={[{ name: "IBC", points: ibcPts }]} unit="pts" height={220} area labels={chartLabels(lang)} rangeLabels={d.range}
          ranges={["1M", "3M", "YTD", "1A"]} initial="YTD" stats={{ periods: ["1D", "1W", "1M", "YTD"] }}>
          <div className="big">{num(ibcMeta?.last_value, lang, 2)}<small>pts</small></div>
        </ChartCard>
        <div className="card">
          <div className="card-top"><h3>{es ? "Rendimiento del IBC" : "IBC return"}</h3><span className="date">{es ? "en bolívares y en dólares" : "in bolivars and dollars"}</span></div>
          <table className="tbl" style={{ marginTop: 14 }}>
            <thead><tr><th>{es ? "Período" : "Period"}</th><th style={{ textAlign: "right" }}>Bs</th><th style={{ textAlign: "right" }}>{es ? "US$ oficial" : "US$ official"}</th><th style={{ textAlign: "right" }}>{es ? "US$ paralelo" : "US$ parallel"}</th></tr></thead>
            <tbody>{ret.map((r) => <tr key={r.p}><td>{PERIOD_LABEL[r.p][lang]}</td>{pctCell(r.bs)}{pctCell(r.of)}{pctCell(r.par)}</tr>)}</tbody>
          </table>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{es
            ? "Cuánto ganó o perdió quien tenía el índice, medido en bolívares y convertido a dólares con la tasa de cada fecha. Si el rendimiento en US$ es menor que en Bs, la devaluación se comió parte de la subida."
            : "Gain or loss for a holder of the index, in bolivars and converted to dollars at each date's rate. A lower US$ return means devaluation ate part of the rally."}</p>
        </div>
      </div>
      {monto && (hist.bvc_monto ?? []).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SeriesCard s={monto} points={mp} lang={lang} bars initial="3M" height={200} stats={false}
            note={(vsAvg != null ? (es
              ? `Última sesión: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% frente al promedio de las 20 sesiones anteriores (Bs ${num(avg20, lang, 0)}). `
              : `Last session: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% vs the previous 20-session average (Bs ${num(avg20, lang, 0)}). `) : "")
              + (es ? "Cada barra es una sesión." : "Each bar is one session.")} />
        </div>
      )}
      <div className="chart-tools" style={{ marginBottom: 12, gap: 10 }}>
        <div className="seg">
          <Link href={href("RV", fxKey)} className={market === "RV" ? "on" : ""}>{d.equities}</Link>
          <Link href={href("RF", fxKey)} className={market === "RF" ? "on" : ""}>{d.fixedIncome}</Link>
        </div>
        {market === "RV" && (
          <>
            <span className="muted">{d.fxBasis}</span>
            <div className="seg">
              <Link href={href(market, "paralelo")} className={fxKey === "paralelo" ? "on" : ""}>{d.parallel}</Link>
              <Link href={href(market, "oficial")} className={fxKey === "oficial" ? "on" : ""}>{d.official}</Link>
            </div>
            {totalCap > 0 && <span className="muted">{es ? "Capitalización total" : "Total market cap"}: <b>US$ {num(totalCap / 1e6, lang, 0)} {es ? "millones" : "million"}</b></span>}
          </>
        )}
      </div>
      <div className="card">
        <CardScope initial="1M">
        <CardControls lang={lang} money ranges={null} rangeLabels={d.range} />
        {rows.length ? <QuoteTable rows={rows} lang={lang} showCap={market === "RV"} labels={{ symbol: d.symbol, company: d.company, price: d.price, change: d.change, volume: d.volume, amount: d.amount, mcap: `${d.mcap} · ${fxKey === "paralelo" ? d.parallel : d.official}` }} />
          : <div className="empty">{d.noData}</div>}
        </CardScope>
      </div>
      <h2 style={{ margin: "40px 0 16px" }}>{d.cat.mercados}</h2>
      <div className="grid g2">
        {idx.filter((s) => !HIDE.includes(s.code) && (hist[s.code] ?? []).length > 0).map((s) => (
          <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} allowLog={s.frequency === "D"}
            bars={s.frequency === "M"} ranges={s.code.startsWith("ibc") ? ["1M", "3M", "YTD", "1A"] : undefined} />
        ))}
      </div>
    </>
  );
}
