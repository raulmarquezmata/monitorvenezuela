import Link from "next/link";
import QuoteTable from "@/components/QuoteTable";
import Downloads from "@/components/Downloads";
import ChartCard from "@/components/ChartCard";
import { CardControls, CardScope } from "@/components/CardScope";
import { chartLabels, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { change, PERIOD_LABEL, valueAt, type Period, type Point } from "@/lib/stats";
import { bvcLatest, configured, dailyReportUrl, history, latest, mktcapReportUrl } from "@/lib/data";
import { date, num } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

/** Devuelve la URL solo si el archivo ya existe en Storage (si no, el botón no se muestra). */
async function existing(u: string | null): Promise<string | null> {
  if (!u) return null;
  try { const r = await fetch(u, { method: "HEAD", next: { revalidate: 600 } }); return r.ok ? u : null; } catch { return null; }
}

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
  // monto acumulado de la semana, el mes y el año (renta variable, Bs)
  const lastD = mp.at(-1)?.[0] ?? "";
  const monday = (() => { if (!lastD) return ""; const x = new Date(`${lastD}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
  const sumFrom = (d0: string) => mp.filter((p) => p[0] >= d0).reduce((a, p) => a + p[1], 0);
  const acc = lastD ? [
    { k: es ? "Esta semana" : "This week", v: sumFrom(monday), n: mp.filter((p) => p[0] >= monday).length },
    { k: es ? "Este mes" : "This month", v: sumFrom(lastD.slice(0, 8) + "01"), n: mp.filter((p) => p[0] >= lastD.slice(0, 8) + "01").length },
    { k: es ? "En el año" : "Year to date", v: sumFrom(lastD.slice(0, 5) + "01-01"), n: mp.filter((p) => p[0] >= lastD.slice(0, 5) + "01-01").length },
  ] : [];
  const of = fx.find((s) => s.code === "usd_bcv")?.last_value ?? null;
  const par = fx.find((s) => s.code === "usd_paralelo")?.last_value ?? null;
  const capBs = rv.reduce((a, r) => a + (r.market_cap_bs ?? 0), 0);
  // los tres mayores por empresa (las clases A/B de una misma compañía se suman)
  const byCo = new Map<string, { symbol: string; cap: number }>();
  for (const r of rv) if (r.market_cap_bs) { const k = (r.company ?? r.symbol).trim().toUpperCase(); const g = byCo.get(k); byCo.set(k, { symbol: g ? (g.symbol.length <= r.symbol.length ? g.symbol : r.symbol) : r.symbol, cap: (g?.cap ?? 0) + r.market_cap_bs }); }
  const top3 = [...byCo.values()].sort((a, b) => b.cap - a.cap).slice(0, 3).map((g) => ({ symbol: g.symbol, market_cap_bs: g.cap }));
  const mm = (v: number | null) => v == null ? "—" : num(v / 1e6, lang, 0);
  const session = rv[0]?.date ?? rf[0]?.date;
  const ver = `${session ?? ""}-${Math.floor(Date.now() / 6e5)}`;
  const [pdfUrl, dailyUrl] = await Promise.all([existing(mktcapReportUrl(lang, ver)), existing(dailyReportUrl(lang, ver))]);
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {dailyUrl && <a className="btn primary" href={dailyUrl} target="_blank" rel="noreferrer">⬇ {es ? "Informe de cierre (PDF)" : "Closing report (PDF)"}</a>}
          {pdfUrl && <a className="btn primary" href={pdfUrl} target="_blank" rel="noreferrer">⬇ {es ? "Informe mkt cap (PDF)" : "Market cap report (PDF)"}</a>}
          <a className="btn" href={`/api/export?bvc=RV&format=xlsx&lang=${lang}`}>⬇ Excel</a>
          <a className="btn" href={`/api/export?bvc=RV&format=csv&lang=${lang}`}>CSV</a>
        </div>
      </div>
      {/* 1) IBC a todo el ancho */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard lang={lang} title={es ? "Índice Bursátil Caracas (IBC)" : "Caracas Stock Index (IBC)"} date={ibcMeta?.last_date ? date(ibcMeta.last_date, lang) : ""}
          series={[{ name: "IBC", points: ibcPts }]} unit="pts" height={300} area labels={chartLabels(lang)} rangeLabels={d.range}
          ranges={["1M", "3M", "YTD", "1A", "MAX"]} initial="YTD" stats={{ periods: ["1D", "1W", "1M", "YTD"] }}>
          <div className="big">{num(ibcMeta?.last_value, lang, 2)}<small>pts</small></div>
        </ChartCard>
      </div>

      {/* 2) Fila de dos cuadros: (rendimiento del IBC + capitalización + descargas) | monto negociado */}
      <div className="grid g2 eq" style={{ marginBottom: 24 }}>
      <div className="card stack">
        <div>
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
            ? "Cuánto ganó o perdió quien tenía el índice, en bolívares y convertido a dólares con la tasa de cada fecha. Si el rendimiento en US$ es menor que en Bs, la devaluación se comió parte de la subida."
            : "Gain or loss for a holder of the index, in bolivars and converted to dollars at each date's rate. A lower US$ return means devaluation ate part of the rally."}</p>
        </div>
        <div>
          <div className="card-top"><h3>{es ? "Capitalización total · renta variable" : "Total market cap · equities"}</h3><span className="date">{session ? date(session, lang) : ""}</span></div>
          {capBs > 0 ? (<>
            <div className="cap-grid">
              <div><span className="muted">{es ? "US$ mercado alternativo" : "US$ alternative market"}</span><b>US$ {mm(par ? capBs / par : null)} <small>MM</small></b></div>
              <div><span className="muted">{es ? "US$ oficial BCV" : "US$ official (BCV)"}</span><b>US$ {mm(of ? capBs / of : null)} <small>MM</small></b></div>
              <div><span className="muted">{es ? "Bolívares" : "Bolivars"}</span><b>Bs {mm(capBs)} <small>MM</small></b></div>
            </div>
            {top3.length > 0 && <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>{es ? "Los tres mayores: " : "Largest three: "}
              {top3.map((r, i) => <span key={r.symbol}>{i ? " · " : ""}<Link href={`/${lang}/bvc/${r.symbol}`}>{r.symbol}</Link> {num((r.market_cap_bs! / capBs) * 100, lang, 1)}%</span>)}</p>}
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>{es ? "Acciones en circulación × último cierre, convertido con la tasa de hoy." : "Shares outstanding × last close, converted at today's rate."}</p>
          </>) : <div className="empty" style={{ height: 120 }}>{d.noData}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            <a className="btn" href={`/api/export?bvc=mktcap&format=xlsx&lang=${lang}`}>⬇ {es ? "Lista de capitalización (Excel)" : "Market cap list (Excel)"}</a>
          </div>
        </div>
      </div>

      {monto && mp.length > 0 && (
          <SeriesCard s={monto} points={mp} lang={lang} bars clip initial="3M" height={250} stats={false}
            extra={acc.length > 0 && <div className="cap-grid acc">{acc.map((x) => <div key={x.k}><span className="muted">{x.k} · {x.n} {es ? "sesiones" : "sessions"}</span><b>Bs {new Intl.NumberFormat(es ? "es-VE" : "en-US", { notation: x.v >= 1e6 ? "compact" : "standard", maximumFractionDigits: x.v >= 1e6 ? 1 : 0 }).format(x.v)}</b></div>)}</div>}
            note={(vsAvg != null ? (es
              ? `Última sesión: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% frente al promedio de las 20 sesiones anteriores (Bs ${num(avg20, lang, 0)}). `
              : `Last session: ${vsAvg >= 0 ? "+" : ""}${num(vsAvg, lang, 1)}% vs the previous 20-session average (Bs ${num(avg20, lang, 0)}). `) : "")
              + (es ? "Cada barra es una sesión. Si una sesión es atípica, su barra se corta (↑) para que el resto se lea; pase el cursor para ver su valor real."
                    : "Each bar is one session. An outlier session is cut (↑) so the rest stays readable; hover to see its actual value.")} />
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

      <section className="section">
        <SectionHead label={es ? "Informes para descargar" : "Reports to download"} />
        <Downloads lang={lang} />
      </section>

      <details className="card fold" style={{ marginTop: 24 }}>
        <summary><h3 style={{ display: "inline" }}>{d.cat.mercados}</h3> <span className="muted">· {es ? "índices sectoriales, renta fija, Mercado de Otros Bienes y BOLPRIAVEN" : "sector indices, fixed income, Other Goods Market and BOLPRIAVEN"}</span></summary>
        <div className="grid g2">
        {idx.filter((s) => !HIDE.includes(s.code) && (hist[s.code] ?? []).length > 0).map((s) => (
          <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} allowLog={s.frequency === "D"}
            bars={s.frequency === "M"} ranges={s.code.startsWith("ibc") ? ["1M", "3M", "YTD", "1A"] : undefined} />
        ))}
        </div>
      </details>
    </>
  );
}
