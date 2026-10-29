import Link from "next/link";
import LineChart from "@/components/LineChart";
import { chartLabels, NotConfigured } from "@/components/ui";
import { bvcSymbol, configured, history } from "@/lib/data";
import { compact, date, num, pct } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 300;

export default async function SymbolPage({ params }: { params: { lang: Lang; symbol: string } }) {
  const { lang } = params;
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [{ meta, quotes }, fx] = await Promise.all([bvcSymbol(symbol), history(["usd_bcv", "usd_paralelo"], 15)]);
  const last = quotes.at(-1);
  const closes = quotes.filter((q) => q.close != null).map((q) => [q.date, q.close!] as [string, number]);
  // Precio en US$ con el tipo de cambio vigente en cada fecha
  const toUsd = (fxPts: [string, number][]) => {
    let j = 0;
    const out: [string, number][] = [];
    for (const [dte, v] of closes) {
      while (j + 1 < fxPts.length && fxPts[j + 1][0] <= dte) j++;
      if (fxPts[j] && fxPts[j][0] <= dte) out.push([dte, v / fxPts[j][1]]);
    }
    return out;
  };
  const usd = toUsd(fx.usd_paralelo);
  const usdOf = toUsd(fx.usd_bcv);
  const shares = meta?.shares_outstanding as number | null | undefined;
  const lastUsd = usd.at(-1)?.[1];
  return (
    <>
      <p className="muted"><Link href={`/${lang}/bvc`}>← {d.nav.bvc}</Link></p>
      <h1>{symbol} <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>{meta?.company ?? meta?.name ?? ""}</span></h1>
      <p className="sub">{meta?.isin ? `ISIN ${meta.isin} · ` : ""}{meta?.sector ?? ""}</p>
      <div className="grid kpis">
        <div className="card kpi"><div className="label">{d.price}</div><div className="val">{num(last?.close, lang)}</div>
          <div className="meta"><span className={(last?.var_pct ?? 0) > 0 ? "up" : (last?.var_pct ?? 0) < 0 ? "down" : "flat"}>{pct(last?.var_pct, lang)}</span><span>{date(last?.date, lang)}</span></div></div>
        <div className="card kpi"><div className="label">{lang === "es" ? "Precio en US$ (paralelo)" : "Price in US$ (parallel)"}</div><div className="val">{num(lastUsd, lang, 4)}</div></div>
        <div className="card kpi"><div className="label">{d.mcap}</div><div className="val">{shares && lastUsd ? compact(shares * lastUsd, lang) : "—"}</div>
          <div className="meta">{shares ? `${compact(shares, lang)} ${lang === "es" ? "acciones" : "shares"}` : ""}</div></div>
        <div className="card kpi"><div className="label">{d.amount}</div><div className="val">{compact(last?.amount, lang)}</div><div className="meta">{last?.trades ? `${last.trades} ${lang === "es" ? "operaciones" : "trades"}` : ""}</div></div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head"><h3>{lang === "es" ? "Precio de cierre" : "Closing price"}</h3><span className="muted">Bs</span></div>
        <LineChart lang={lang} unit="Bs" height={280} allowLog labels={chartLabels(lang)} series={[{ name: symbol, points: closes }]} />
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head"><h3>{lang === "es" ? "Precio en US$" : "Price in US$"}</h3><span className="muted">US$</span></div>
        <LineChart lang={lang} unit="US$" decimals={4} height={240} labels={chartLabels(lang)}
          series={[{ name: lang === "es" ? "Al paralelo" : "Parallel rate", points: usd }, { name: lang === "es" ? "Al oficial" : "Official rate", points: usdOf }]} />
      </div>
    </>
  );
}
