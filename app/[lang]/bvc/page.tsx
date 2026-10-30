import Link from "next/link";
import QuoteTable from "@/components/QuoteTable";
import { Kpi, NotConfigured, SeriesCard } from "@/components/ui";
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
  const hist = await history(idx.map((s) => s.code), 20);
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
      <div className="grid g3" style={{ marginBottom: 24 }}>
        {["ibc", "ibc_usd_paralelo", "bvc_monto"].map((c) => <Kpi key={c} s={idx.find((x) => x.code === c)} points={hist[c] ?? []} lang={lang} />)}
      </div>
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
        {rows.length ? <QuoteTable rows={rows} lang={lang} showCap={market === "RV"} labels={{ symbol: d.symbol, company: d.company, price: d.price, change: d.change, volume: d.volume, amount: d.amount, mcap: `${d.mcap} · ${fxKey === "paralelo" ? d.parallel : d.official}` }} />
          : <div className="empty">{d.noData}</div>}
      </div>
      <h2 style={{ margin: "40px 0 16px" }}>{d.cat.mercados}</h2>
      <div className="grid g2">
        {idx.filter((s) => !["ibc", "ibc_usd_paralelo", "bvc_monto"].includes(s.code)).map((s) => <SeriesCard key={s.code} s={s} points={hist[s.code] ?? []} lang={lang} allowLog />)}
      </div>
    </>
  );
}
