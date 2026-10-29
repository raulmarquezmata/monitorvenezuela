import Link from "next/link";
import LineChart from "@/components/LineChart";
import { chartLabels, Kpi, NotConfigured, SectionHead } from "@/components/ui";
import { bvcLatest, configured, events, history, latest, news } from "@/lib/data";
import { num, pct, fmtDateFor } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 300;

const KPIS = ["usd_bcv", "usd_paralelo", "brecha_cambiaria", "inflacion_mensual", "reservas_internacionales", "merey"];

export default async function Home({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [all, hist, quotes, items, evs] = await Promise.all([
    latest(), history([...KPIS, "ibc"], 12), bvcLatest(), news(5), events(4),
  ]);
  const by = Object.fromEntries(all.map((s) => [s.code, s]));
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
          {KPIS.map((c) => <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} href={href(c)} />)}
        </div>
      </section>

      <section className="section grid split">
        <div>
          <SectionHead label={d.bvcSection} href={`/${lang}/bvc`} more={d.seeMarket} />
          <div className="card">
            <div className="card-top"><h3>{lang === "es" ? "Índice IBC" : "IBC index"}</h3><span className="date">{ibc?.last_date ? fmtDateFor(ibc.last_date, "D", lang) : ""}</span></div>
            <div className="big" style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              {num(ibc?.last_value, lang, 2)}<small style={{ marginLeft: 0 }}>pts</small>
              {ibcDay != null && <span className={`delta ${ibcDay >= 0 ? "up" : "down"}`}>{ibcDay >= 0 ? "▲" : "▼"} {pct(ibcDay, lang)}<small>{d.today}</small></span>}
            </div>
            <LineChart lang={lang} series={[{ name: "IBC", points: ibcPts }]} unit="pts" height={170} area labels={chartLabels(lang)} />
            {[{ q: gain, l: d.topGain }, { q: loss, l: d.topLoss }].map(({ q, l }) => q && (
              <div key={l} style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                <div><div className="muted">{l}</div><Link href={`/${lang}/bvc/${q.symbol}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 18 }}>{q.symbol}{q.company ? ` · ${q.company}` : ""}</Link></div>
                <span className={`delta ${q.var_pct! >= 0 ? "up" : "down"}`}>{q.var_pct! >= 0 ? "▲" : "▼"} {pct(q.var_pct, lang)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHead label={d.headlines} href={`/${lang}/noticias`} more={d.allHeadlines} />
          <ul className="headlines">
            {items.map((n) => (
              <li key={n.id}>
                <div className="m">{n.category && <span className="tag">{d.cats[n.category] ?? n.category}</span>}<span>{n.source} · {time(n.published_at)}</span></div>
                <a className="t" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
              </li>
            ))}
            {!items.length && <li className="muted">{d.noData}</li>}
          </ul>
        </div>
      </section>

      <section className="section">
        <SectionHead label={d.fxSection} href={`/${lang}/indicadores/cambiario`} more={d.seeMacro} />
        <div className="card">
          <div className="card-top"><h3>{d.oficialVsParalelo}</h3><span className="date">Bs/US$</span></div>
          <LineChart lang={lang} decimals={2} height={300} labels={chartLabels(lang)}
            series={[{ name: lang === "es" ? "Oficial BCV" : "Official (BCV)", points: hist.usd_bcv ?? [] }, { name: lang === "es" ? "Paralelo (Binance)" : "Parallel (Binance)", points: hist.usd_paralelo ?? [] }]} />
        </div>
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
