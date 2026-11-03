import Link from "next/link";
import StockChart from "@/components/StockChart";
import { chartLabels, NotConfigured } from "@/components/ui";
import empresas from "@/config/bvc_empresas.json";
import { bvcEvents, bvcSymbol, companyClasses, configured, history, stockReportUrl, symbolNews } from "@/lib/data";
import { compact, date, dateTime, num } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { change, PERIOD_LABEL, type Period, type Point } from "@/lib/stats";

export const revalidate = 300;

type Empresa = { nombre?: string; es?: string; en?: string; alias?: string[] };
const EMP = (empresas as { empresas: Record<string, Empresa> }).empresas;
const PERIODS: Period[] = ["1D", "WTD", "1W", "1M", "3M", "YTD", "YOY"];

export default async function SymbolPage({ params }: { params: { lang: Lang; symbol: string } }) {
  const { lang } = params;
  const es = lang === "es";
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [{ meta, quotes }, fx] = await Promise.all([bvcSymbol(symbol), history(["usd_bcv", "usd_paralelo"], 15)]);
  const classes = await companyClasses(meta?.company as string | undefined, symbol);
  const syms = classes.length ? classes.map((c) => c.symbol) : [symbol];
  const [events, news] = await Promise.all([bvcEvents(syms), symbolNews(syms, lang)]);
  const emp = EMP[symbol] ?? {};
  const name = emp.nombre ?? (meta?.company as string | undefined) ?? (meta?.name as string | undefined) ?? symbol;
  const desc = es ? emp.es : emp.en;

  const traded = quotes.filter((q) => q.close != null && q.close > 0);
  const last = traded.at(-1);
  const bs: Point[] = traded.map((q) => [q.date, q.close!]);
  // precio en US$ con el tipo de cambio vigente en cada fecha
  const toUsd = (fxPts: Point[]) => {
    let j = 0;
    const out: Point[] = [];
    for (const [dte, v] of bs) {
      while (j + 1 < fxPts.length && fxPts[j + 1][0] <= dte) j++;
      if (fxPts[j] && fxPts[j][0] <= dte) out.push([dte, v / fxPts[j][1]]);
    }
    return out;
  };
  const usdOf = toUsd(fx.usd_bcv ?? []), usdPar = toUsd(fx.usd_paralelo ?? []);
  const rateOf = fx.usd_bcv?.at(-1)?.[1] ?? null, ratePar = fx.usd_paralelo?.at(-1)?.[1] ?? null;
  const shares = (meta?.shares_outstanding as number | null | undefined) ?? null;
  const capBs = shares && last?.close ? shares * last.close : null;
  const company = classes.length > 1 ? classes.reduce((a, c) => a + (c.market_cap_bs ?? 0), 0) : null;
  const lastSession = quotes.at(-1);
  const rets = PERIODS.map((p) => ({ p, bs: change(bs, p), of: change(usdOf, p), par: change(usdPar, p) }));
  const pctCell = (v: number | null) => <td className={v == null ? "" : v >= 0 ? "up" : "down"} style={{ textAlign: "right" }}>{v == null ? "—" : `${v > 0 ? "+" : ""}${num(v, lang, 2)}%`}</td>;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < today);
  const kind = (k: string | null) => k === "extraordinaria" ? (es ? "Asamblea extraordinaria" : "Extraordinary meeting")
    : k === "ordinaria" ? (es ? "Asamblea ordinaria" : "Ordinary meeting") : (es ? "Asamblea de accionistas" : "Shareholders' meeting");
  const recent = last && Date.parse(last.date) > Date.now() - 120 * 864e5;
  const pdfEs = recent ? stockReportUrl(symbol, "es", last?.date) : null;
  const pdfEn = recent ? stockReportUrl(symbol, "en", last?.date) : null;
  const usd = (v: number | null | undefined, rate: number | null) => (v != null && rate ? v / rate : null);
  const Kpi = ({ label, val, meta: m }: { label: string; val: React.ReactNode; meta?: React.ReactNode }) => (
    <div className="card kpi"><div className="label">{label}</div><div className="val">{val}</div>{m && <div className="meta">{m}</div>}</div>
  );

  return (
    <>
      <p className="muted"><Link href={`/${lang}/bvc`}>← {d.nav.bvc}</Link></p>
      <div className="head-row">
        <div>
          <h1 style={{ marginBottom: 4 }}>{symbol} <span className="muted" style={{ fontSize: 18, fontWeight: 400 }}>{name}</span></h1>
          <p className="sub" style={{ marginBottom: 0 }}>{[meta?.sector, meta?.isin ? `ISIN ${meta.isin}` : null, classes.length > 1 ? (es ? `Clases: ${syms.join(", ")}` : `Share classes: ${syms.join(", ")}`) : null].filter(Boolean).join(" · ")}</p>
        </div>
        {pdfEs && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <a className="btn on" href={es ? pdfEs : pdfEn!} target="_blank" rel="noreferrer">⬇ {es ? "Informe PDF al día" : "Up-to-date PDF report"}</a>
            <a className="btn" href={es ? pdfEn! : pdfEs} target="_blank" rel="noreferrer">{es ? "English" : "Español"}</a>
          </div>
        )}
      </div>
      {desc && <p className="stock-desc">{desc}</p>}

      <div className="grid kpis k4" style={{ marginTop: 12 }}>
        <Kpi label={es ? "Precio (Bs)" : "Price (Bs)"} val={num(last?.close, lang)}
          meta={<><span className={(rets[0].bs ?? 0) > 0 ? "up" : (rets[0].bs ?? 0) < 0 ? "down" : "flat"}>{rets[0].bs != null ? `${rets[0].bs > 0 ? "+" : ""}${num(rets[0].bs, lang, 2)}%` : "—"}</span><span>{date(last?.date, lang)}</span></>} />
        <Kpi label={es ? "Precio en US$ oficial" : "Price in US$ (official)"} val={num(usdOf.at(-1)?.[1], lang, 4)} meta={rateOf ? `Bs ${num(rateOf, lang, 2)} / US$` : undefined} />
        <Kpi label={es ? "Precio en US$ paralelo" : "Price in US$ (parallel)"} val={num(usdPar.at(-1)?.[1], lang, 4)} meta={ratePar ? `Bs ${num(ratePar, lang, 2)} / US$` : undefined} />
        <Kpi label={es ? "Monto negociado" : "Traded amount"} val={lastSession?.amount ? `Bs ${compact(lastSession.amount, lang)}` : "—"}
          meta={lastSession?.amount ? `US$ ${compact(usd(lastSession.amount, rateOf), lang)} ${es ? "of." : "off."} · US$ ${compact(usd(lastSession.amount, ratePar), lang)} par.${lastSession.trades ? ` · ${lastSession.trades} ${es ? "op." : "trades"}` : ""}` : (es ? "sin operaciones en la última sesión" : "no trades in the last session")} />
        <Kpi label={es ? "Acciones en circulación" : "Shares outstanding"} val={shares ? compact(shares, lang) : "—"} meta={shares ? num(shares, lang, 0) : undefined} />
        <Kpi label={es ? "Capitalización (Bs)" : "Market cap (Bs)"} val={capBs ? compact(capBs, lang) : "—"}
          meta={company ? `${es ? "Empresa, todas las clases" : "Company, all classes"}: Bs ${compact(company, lang)}` : undefined} />
        <Kpi label={es ? "Capitalización US$ oficial" : "Market cap US$ (official)"} val={capBs && rateOf ? compact(capBs / rateOf, lang) : "—"}
          meta={company && rateOf ? `${es ? "Empresa" : "Company"}: US$ ${compact(company / rateOf, lang)}` : undefined} />
        <Kpi label={es ? "Capitalización US$ paralelo" : "Market cap US$ (parallel)"} val={capBs && ratePar ? compact(capBs / ratePar, lang) : "—"}
          meta={company && ratePar ? `${es ? "Empresa" : "Company"}: US$ ${compact(company / ratePar, lang)}` : undefined} />
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <StockChart lang={lang} symbol={symbol} bs={bs} usdOf={usdOf} usdPar={usdPar} shares={shares} labels={chartLabels(lang)} rangeLabels={d.range} initial="1A" />
        <div className="card">
          <div className="card-top"><h3>{es ? "Rendimiento" : "Return"}</h3><span className="date">{es ? "en bolívares y en dólares" : "in bolivars and dollars"}</span></div>
          <div className="tbl-wrap">
            <table className="tbl compact" style={{ marginTop: 14 }}>
              <thead><tr><th>{es ? "Período" : "Period"}</th><th style={{ textAlign: "right" }}>Bs</th>
                <th style={{ textAlign: "right" }}><span className="long">{es ? "US$ oficial" : "US$ official"}</span><span className="short">{es ? "US$ of." : "US$ off."}</span></th>
                <th style={{ textAlign: "right" }}><span className="long">{es ? "US$ paralelo" : "US$ parallel"}</span><span className="short">US$ par.</span></th></tr></thead>
              <tbody>{rets.map((r) => <tr key={r.p}><td style={{ whiteSpace: "nowrap" }}>{PERIOD_LABEL[r.p][lang]}</td>{pctCell(r.bs)}{pctCell(r.of)}{pctCell(r.par)}</tr>)}</tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{es
            ? "«En la semana» compara con el último cierre de la semana anterior; «Semana» con el cierre de hace 7 días. Los rendimientos en US$ usan el tipo de cambio de cada fecha."
            : "“Week to date” compares with last week's final close; “Week” with the close 7 days earlier. US$ returns use each date's exchange rate."}</p>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <div className="card">
          <div className="card-top"><h3>{es ? "Próxima asamblea" : "Next shareholders' meeting"}</h3></div>
          {upcoming.length ? upcoming.slice(0, 3).map((e) => {
            const dd = new Date(`${e.date}T12:00:00Z`);
            return (
              <div className="event" key={e.id} style={{ marginTop: 12 }}>
                <div className="day"><b>{dd.getUTCDate()}</b><span>{new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(dd)}</span></div>
                <div>
                  <div><b>{kind(e.kind)}</b>{e.symbol !== symbol ? ` · ${e.symbol}` : ""}</div>
                  {e.title && <div className="muted" style={{ fontSize: 14 }}>{e.title}</div>}
                  <div className="muted" style={{ fontSize: 13 }}>{es ? "Fuente" : "Source"}: {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source}</div>
                </div>
              </div>
            );
          }) : <p className="muted" style={{ marginTop: 12 }}>{es ? "No hay una convocatoria publicada todavía." : "No meeting has been called yet."}</p>}
          {past[0] && <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>{es ? "Última asamblea" : "Last meeting"}: {kind(past[0].kind).toLowerCase()} · {date(past[0].date, lang)}</p>}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{es
            ? "Se toman de las convocatorias publicadas por la BVC, SUNAVAL y la prensa, y de la carga manual."
            : "Taken from notices published by the BVC, SUNAVAL and the press, plus manual entries."}</p>
        </div>
        <div className="card">
          <div className="card-top"><h3>{es ? `Noticias de ${name}` : `${name} news`}</h3></div>
          <ul className="news" style={{ marginTop: 8 }}>
            {news.map((n) => (
              <li key={n.url}><a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                <div className="m">{n.source} · {dateTime(n.published_at, lang)}{n.orig_lang && n.orig_lang !== lang ? ` · ${es ? "trad." : "transl."} ${n.orig_lang.toUpperCase()}` : ""}</div></li>
            ))}
            {!news.length && <li className="muted">{es ? "Sin noticias recientes de esta empresa." : "No recent news about this company."}</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
