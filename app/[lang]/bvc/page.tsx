import Link from "next/link";
import QuoteTable from "@/components/QuoteTable";
import ChartCard from "@/components/ChartCard";
import { CardControls, CardScope } from "@/components/CardScope";
import { chartLabels, NotConfigured, SeriesCard } from "@/components/ui";
import { change, PERIOD_LABEL, valueAt, type Period, type Point } from "@/lib/stats";
import { bvcLatest, configured, history, latest, mktcapReportUrl } from "@/lib/data";
import { date, num } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

// se regenera cada 2 minutos; los botones (moneda, renta fija) ya no recargan la página
export const revalidate = 120;

export default async function BVC({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const [rv, rf, idx, fx] = await Promise.all([bvcLatest("RV"), bvcLatest("RF"), latest("mercados"), latest("cambiario")]);
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
  const of = fx.find((s) => s.code === "usd_bcv")?.last_value ?? null;
  const par = fx.find((s) => s.code === "usd_paralelo")?.last_value ?? null;
  const capBs = rv.reduce((a, r) => a + (r.market_cap_bs ?? 0), 0);
  const nCap = rv.filter((r) => r.market_cap_bs).length;
  const top3 = [...rv].filter((r) => r.market_cap_bs).sort((a, b) => b.market_cap_bs! - a.market_cap_bs!).slice(0, 3);
  const mm = (v: number | null) => v == null ? "—" : num(v / 1e6, lang, 0);
  const session = rv[0]?.date ?? rf[0]?.date;
  const labels = { symbol: d.symbol, company: d.company, price: d.price, change: d.change, volume: d.volume, amount: d.amount, mcap: d.mcap };
  return (
    <>
      <div className="head-row">
        <div>
          <h1>{d.nav.bvc}</h1>
          <p className="sub">
            {session ? `${d.session} ${date(session, lang)} · ` : ""}
            {es ? "Datos con 15 minutos de retraso." : "Data delayed 15 minutes."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <a className="btn" href={`/api/export?bvc=RV&format=xlsx&lang=${lang}`}>⬇ Excel</a>
          <a className="btn" href={`/api/export?bvc=RV&format=csv&lang=${lang}`}>CSV</a>
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
          <div className="tbl-wrap">
          <table className="tbl compact" style={{ marginTop: 14 }}>
            <thead><tr><th>{es ? "Período" : "Period"}</th><th style={{ textAlign: "right" }}>Bs</th>
              <th style={{ textAlign: "right" }}><span className="long">{es ? "US$ oficial" : "US$ official"}</span><span className="short">{es ? "US$ of." : "US$ off."}</span></th>
              <th style={{ textAlign: "right" }}><span className="long">{es ? "US$ alternativo" : "US$ alternative"}</span><span className="short">{es ? "US$ alt." : "US$ alt."}</span></th></tr></thead>
            <tbody>{ret.map((r) => <tr key={r.p}><td>{PERIOD_LABEL[r.p][lang]}</td>{pctCell(r.bs)}{pctCell(r.of)}{pctCell(r.par)}</tr>)}</tbody>
          </table>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{es
            ? "Cuánto ganó o perdió quien tenía el índice, medido en bolívares y convertido a dólares con la tasa de cada fecha. Si el rendimiento en US$ es menor que en Bs, la devaluación se comió parte de la subida."
            : "Gain or loss for a holder of the index, in bolivars and converted to dollars at each date's rate. A lower US$ return means devaluation ate part of the rally."}</p>
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 24 }}>
        {monto && mp.length > 0 && (
          <SeriesCard s={monto} points={mp} lang={lang} bars clip initial="3M" height={200} stats={false}
            note={(vsAvg != null ? (es
              ? `Última sesión: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% frente al promedio de las 20 sesiones anteriores (Bs ${num(avg20, lang, 0)}). `
              : `Last session: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% vs the previous 20-session average (Bs ${num(avg20, lang, 0)}). `) : "")
              + (es ? "Cada barra es una sesión. Si una sesión es atípica, su barra se corta (↑) para que el resto se lea; pase el cursor para ver su valor real."
                    : "Each bar is one session. An outlier session is cut (↑) so the rest stays readable; hover to see its actual value.")} />
        )}
        {capBs > 0 && (
          <div className="card">
            <div className="card-top"><h3>{es ? "Capitalización total · renta variable" : "Total market cap · equities"}</h3><span className="date">{session ? date(session, lang) : ""}</span></div>
            <div className="cap-grid">
              <div><span className="muted">{es ? "US$ mercado alternativo" : "US$ alternative market"}</span><b>US$ {mm(par ? capBs / par : null)} <small>{es ? "millones" : "million"}</small></b></div>
              <div><span className="muted">{es ? "US$ oficial BCV" : "US$ official (BCV)"}</span><b>US$ {mm(of ? capBs / of : null)} <small>{es ? "millones" : "million"}</small></b></div>
              <div><span className="muted">{es ? "Bolívares" : "Bolivars"}</span><b>Bs {mm(capBs)} <small>{es ? "millones" : "million"}</small></b></div>
            </div>
            {top3.length > 0 && <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>{es ? `${nCap} emisores. Los tres mayores: ` : `${nCap} issuers. Largest three: `}
              {top3.map((r, i) => <span key={r.symbol}>{i ? " · " : ""}<Link href={`/${lang}/bvc/${r.symbol}`}>{r.symbol}</Link> {num((r.market_cap_bs! / capBs) * 100, lang, 1)}%</span>)}</p>}
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>{es ? "Acciones en circulación × último cierre, convertido con la tasa de hoy." : "Shares outstanding × last close, converted at today's rate."}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              <a className="btn" href={`/api/export?bvc=mktcap&format=xlsx&lang=${lang}`}>⬇ {es ? "Lista de capitalización (Excel)" : "Market cap list (Excel)"}</a>
              {mktcapReportUrl(lang, session) && <a className="btn" href={mktcapReportUrl(lang, session)!} target="_blank" rel="noreferrer">⬇ {es ? "Descargar informe mkt cap (PDF)" : "Download market cap report (PDF)"}</a>}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <CardScope initial="1M">
          <div className="card-top"><h3>{d.equities}</h3><span className="date">{es ? "clic en una fila para ver la acción" : "click a row to open the stock"}</span></div>
          <CardControls lang={lang} money ranges={null} rangeLabels={d.range} />
          {rv.length ? <QuoteTable rows={rv} lang={lang} showCap labels={labels} />
            : <div className="empty">{d.noData}</div>}
        </CardScope>
      </div>

      <details className="card fold" style={{ marginTop: 16 }}>
        <summary><h3 style={{ display: "inline" }}>{d.fixedIncome}</h3> <span className="muted">· {rf.length} {es ? "instrumentos" : "instruments"}</span>
          <a className="btn" style={{ float: "right" }} href={`/api/export?bvc=RF&format=xlsx&lang=${lang}`}>⬇ Excel</a></summary>
        <CardScope initial="1M">
          <CardControls lang={lang} money ranges={null} rangeLabels={d.range} />
          {rf.length ? <QuoteTable rows={rf} lang={lang} showCap={false} labels={labels} />
            : <div className="empty">{d.noData}</div>}
        </CardScope>
      </details>

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
