import Link from "next/link";
import ChartCard from "@/components/ChartCard";
import { chartLabels, Kpi, NotConfigured, SectionHead } from "@/components/ui";
import { bvcLatest, configured, events, history, latest, news } from "@/lib/data";
import { num, pct, fmtDateFor } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { balanced, groupNews } from "@/lib/newsgroup";

export const revalidate = 300;

const KPIS = ["usd_bcv", "usd_paralelo", "brecha_cambiaria", "inflacion_mensual", "reservas_internacionales", "merey"];
const last = (p?: [string, number][]) => (p && p.length ? p[p.length - 1][1] : null);

export default async function Home({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [all, hist, quotes, items, evs] = await Promise.all([
    latest(), history([...KPIS, "ibc", "inflacion_acumulada", "inflacion_interanual"], 12), bvcLatest(), news(150, undefined, lang), events(4),
  ]);
  const by = Object.fromEntries(all.map((s) => [s.code, s]));
  const headlines = balanced(groupNews(items), 2, 6);
  const href = (c: string) => by[c] ? `/${lang}/indicadores/${by[c].category}#${c}` : undefined;
  const ibc = by.ibc;
  const ibcPts = hist.ibc ?? [];
  const ibcDay = ibcPts.length > 1 ? (ibcPts.at(-1)![1] / ibcPts.at(-2)![1] - 1) * 100 : null;
  const movers = quotes.filter((q) => q.var_pct != null);
  const gain = movers.reduce<typeof movers[number] | null>((a, q) => (!a || q.var_pct! > a.var_pct! ? q : a), null);
  const loss = movers.reduce<typeof movers[number] | null>((a, q) => (!a || q.var_pct! < a.var_pct! ? q : a), null);
  const time = (iso: string) => new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  return (
    <>
      <section className="section">
        <SectionHead label={d.keyIndicators} href={`/${lang}/indicadores/cambiario`} more={d.seeMacro} />
        <div className="grid g3">
          {KPIS.map((c) => {
            const es = lang === "es";
            const periods = c === "reservas_internacionales" ? (["1M", "YTD", "YOY"] as const) : undefined;
            const extra = c === "inflacion_mensual" ? [
              { label: es ? "Mes anterior" : "Prev. month", value: hist[c]?.at(-2)?.[1] ?? null, unit: "%", decimals: 1 },
              { label: es ? "Acumulada del año" : "Year to date", value: last(hist.inflacion_acumulada), unit: "%", decimals: 1 },
              { label: es ? "Interanual" : "Year on year", value: last(hist.inflacion_interanual), unit: "%", decimals: 1 },
            ] : undefined;
            return <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} href={href(c)} periods={periods ? [...periods] : undefined} extra={extra} />;
          })}
        </div>
      </section>

      <section className="section grid split">
        <div>
          <SectionHead label={d.bvcSection} href={`/${lang}/bvc`} more={d.seeMarket} />
          <ChartCard lang={lang} title={lang === "es" ? "Índice IBC" : "IBC index"} date={ibc?.last_date ? fmtDateFor(ibc.last_date, "D", lang) : ""}
            series={[{ name: "IBC", points: ibcPts }]} unit="pts" height={190} area labels={chartLabels(lang)} rangeLabels={d.range}
            ranges={["1M", "3M", "YTD", "1A"]} initial="YTD" stats={{ periods: ["1D", "1W", "1M", "YTD"] }}
            footer={<>
            {[{ q: gain, l: d.topGain }, { q: loss, l: d.topLoss }].map(({ q, l }) => q && (
              <div key={l} style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                <div><div className="muted">{l}</div><Link href={`/${lang}/bvc/${q.symbol}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 18 }}>{q.symbol}{q.company ? ` · ${q.company}` : ""}</Link></div>
                <span className={`delta ${q.var_pct! >= 0 ? "up" : "down"}`}>{q.var_pct! >= 0 ? "▲" : "▼"} {pct(q.var_pct, lang)}</span>
              </div>
            ))}
            </>}>
            <div className="big" style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              {num(ibc?.last_value, lang, 2)}<small style={{ marginLeft: 0 }}>pts</small>
            </div>
          </ChartCard>
        </div>
        <div>
          <SectionHead label={d.headlines} href={`/${lang}/noticias`} more={d.allHeadlines} />
          <ul className="headlines">
            {headlines.map((n) => (
              <li key={n.id}>
                <div className="m">{n.category && <span className="tag">{d.cats[n.category] ?? n.category}</span>}<span>{n.source} · {time(n.published_at)}</span></div>
                <a className="t" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                {n.also.length > 0 && <p className="also">{lang === "es" ? "También en: " : "Also in: "}{n.also.slice(0, 4).map((a, i) => <span key={a.url}>{i > 0 && " · "}<a href={a.url} target="_blank" rel="noreferrer">{a.source}</a></span>)}</p>}
              </li>
            ))}
            {!items.length && <li className="muted">{d.noData}</li>}
          </ul>
        </div>
      </section>

      <section className="section">
        <SectionHead label={d.fxSection} href={`/${lang}/indicadores/cambiario`} more={d.seeMacro} />
        <ChartCard lang={lang} title={d.oficialVsParalelo} date="Bs/US$" decimals={2} height={300} labels={chartLabels(lang)} rangeLabels={d.range}
          initial="3M" allowLog
          series={[{ name: lang === "es" ? "Oficial BCV" : "Official (BCV)", points: hist.usd_bcv ?? [] }, { name: lang === "es" ? "Paralelo" : "Parallel", points: hist.usd_paralelo ?? [] }]} />
      </section>

      {evs.length > 0 && (
        <section className="section">
          <SectionHead label={d.timelineSection} href={`/${lang}/noticias/linea-de-tiempo`} more={d.seeTimeline} />
          <div className="grid g2">
            {evs.map((e) => (
              <div className="card" key={e.id} style={{ padding: "20px 24px" }}>
                <div className="card-top"><span className="tag">{d.cats[e.category ?? ""] ?? e.category}</span><span className="date">{fmtDateFor(e.date, e.precision === "month" ? "M" : "D", lang)}</span></div>
                <h3 style={{ marginTop: 10, lineHeight: 1.35 }}>{lang === "es" ? e.title_es : e.title_en ?? e.title_es}</h3>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
