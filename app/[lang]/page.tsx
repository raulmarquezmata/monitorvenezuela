import Link from "next/link";
import Calculator from "@/components/Calculator";
import ChartCard from "@/components/ChartCard";
import Downloads from "@/components/Downloads";
import NewsTicker from "@/components/NewsTicker";
import Agenda from "@/components/Agenda";
import { chartLabels, Kpi, NotConfigured, SectionHead } from "@/components/ui";
import { bvcLatest, configured, history, latest, news } from "@/lib/data";
import { num, pct, fmtDateFor } from "@/lib/format";
import { prettyName } from "@/lib/names";
import { change } from "@/lib/stats";
import { t, type Lang } from "@/lib/i18n";
import { balanced, groupNews } from "@/lib/newsgroup";

export const revalidate = 300;

const KPIS = ["usd_bcv", "usd_paralelo", "brecha_cambiaria", "inflacion_mensual", "merey", "embi_venezuela"];
const INTL = ["sp500", "nasdaq", "vix", "oro_diario", "bitcoin", "ust_10a"];
const last = (p?: [string, number][]) => (p && p.length ? p[p.length - 1][1] : null);

export default async function Home({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const es = lang === "es";
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [all, hist, quotes, items, calc] = await Promise.all([
    latest(), history([...KPIS, ...INTL, "ibc", "inflacion_acumulada", "inflacion_interanual"], 12), bvcLatest(), news(150, undefined, lang),
    history(["usd_bcv", "usd_paralelo", "eur_bcv", "inflacion_mensual", "ipc_eeuu"], 40),
  ]);
  const by = Object.fromEntries(all.map((s) => [s.code, s]));
  const headlines = balanced(groupNews(items.filter((n) => n.category !== "global")), 2, 6);
  const href = (c: string) => by[c] ? `/${lang}/indicadores/${by[c].category}#${c}` : undefined;
  const ibc = by.ibc;
  const ibcPts = hist.ibc ?? [];
  const movers = quotes.filter((q) => q.var_pct != null);
  const gain = movers.reduce<typeof movers[number] | null>((a, q) => (!a || q.var_pct! > a.var_pct! ? q : a), null);
  const loss = movers.reduce<typeof movers[number] | null>((a, q) => (!a || q.var_pct! < a.var_pct! ? q : a), null);
  const time = (iso: string) => new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  // ---- Qué pasó hoy: frases automáticas con los datos del día
  const day = (c: string) => change(hist[c] ?? [], "1D");
  const verb = (v: number | null, up: string, dn: string, flat: string) => (v == null ? "" : Math.abs(v) < 0.005 ? flat : v > 0 ? up : dn);
  const p2 = (v: number | null) => (v == null ? "—" : pct(Math.abs(v), lang, 2, false));
  const lines: string[] = [];
  if (by.usd_bcv?.last_value) {
    const v = day("usd_bcv");
    lines.push(es ? `El dólar oficial ${verb(v, "subió", "bajó", "se mantuvo")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}a Bs ${num(by.usd_bcv.last_value, lang, 2)}.`
      : `The official dollar ${verb(v, "rose", "fell", "held")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}to Bs ${num(by.usd_bcv.last_value, lang, 2)}.`);
  }
  if (by.usd_paralelo?.last_value) {
    const v = day("usd_paralelo");
    const gap = by.brecha_cambiaria?.last_value;
    lines.push(es ? `El mercado alternativo ${verb(v, "subió", "bajó", "se mantuvo")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}a Bs ${num(by.usd_paralelo.last_value, lang, 2)}${gap != null ? `; la brecha está en ${num(gap, lang, 1)}%` : ""}.`
      : `The alternative market ${verb(v, "rose", "fell", "held")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}to Bs ${num(by.usd_paralelo.last_value, lang, 2)}${gap != null ? `; the gap stands at ${num(gap, lang, 1)}%` : ""}.`);
  }
  if (ibc?.last_value) {
    const v = day("ibc");
    const top = gain && (gain.var_pct ?? 0) > 0 ? (es ? ` Mayor alza: ${gain.symbol} (${pct(gain.var_pct, lang)}).` : ` Top gainer: ${gain.symbol} (${pct(gain.var_pct, lang)}).`) : "";
    lines.push((es ? `El IBC ${verb(v, "subió", "cayó", "cerró sin cambios")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}a ${num(ibc.last_value, lang, 2)} puntos.`
      : `The IBC ${verb(v, "rose", "fell", "was flat")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) + " " : ""}to ${num(ibc.last_value, lang, 2)} points.`) + top);
  }
  if (by.sp500?.last_value) {
    const v = day("sp500"), y10 = by.ust_10a?.last_value;
    lines.push(es ? `En Wall Street, el S&P 500 ${verb(v, "sube", "baja", "está plano")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) : ""}${y10 != null ? `; el bono del Tesoro a 10 años rinde ${num(y10, lang, 2)}%` : ""}.`
      : `On Wall Street, the S&P 500 is ${verb(v, "up", "down", "flat")} ${v != null && Math.abs(v) >= 0.005 ? p2(v) : ""}${y10 != null ? `; the 10-year Treasury yields ${num(y10, lang, 2)}%` : ""}.`);
  }
  if (by.merey?.last_value) lines.push(es ? `La cesta Merey promedió US$ ${num(by.merey.last_value, lang, 2)} en ${fmtDateFor(by.merey.last_date!, "M", lang)} (OPEP).` : `The Merey basket averaged US$ ${num(by.merey.last_value, lang, 2)} in ${fmtDateFor(by.merey.last_date!, "M", lang)} (OPEC).`);

  const ticker = groupNews(items.filter((n) => n.category !== "global")).slice(0, 18).map((n) => ({ t: n.title, url: n.url, s: n.source ?? "" }));
  return (
    <>
      {ticker.length > 0 && <NewsTicker items={ticker} label={es ? "Última hora" : "Latest"} />}
      {lines.length > 0 && (
        <section className="section">
          <details className="card today fold">
            <summary><h3 style={{ display: "inline" }}>{es ? "Qué pasó hoy" : "Today at a glance"}</h3> <span className="muted">· {lines[0]}</span></summary>
            <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        </section>
      )}

      <section className="section">
        <SectionHead label={d.keyIndicators} href={`/${lang}/indicadores/cambiario`} more={d.seeMacro} />
        <div className="grid g3">
          {KPIS.map((c) => {
            const extra = c === "inflacion_mensual" ? [
              { label: es ? "Mes anterior" : "Prev. month", value: hist[c]?.at(-2)?.[1] ?? null, unit: "%", decimals: 1 },
              { label: es ? "Acumulada del año" : "Year to date", value: last(hist.inflacion_acumulada), unit: "%", decimals: 1 },
              { label: es ? "Interanual" : "Year on year", value: last(hist.inflacion_interanual), unit: "%", decimals: 1 },
            ] : undefined;
            return <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} href={href(c)} extra={extra} />;
          })}
        </div>
      </section>

      {INTL.some((c) => by[c]?.last_value != null) && (
        <section className="section">
          <SectionHead label={d.nav.intl} href={`/${lang}/internacional`} more={es ? "Ver mercados" : "See markets"} />
          <div className="card" style={{ padding: 0 }}>
            <div className="ticker-strip">
              {INTL.filter((c) => by[c]).map((c) => {
                const v = c === "ust_10a" ? null : day(c);
                const isRate = c === "ust_10a";
                return (
                  <Link key={c} href={`/${lang}/internacional`}>
                    <div className="n">{es ? by[c].name_es.replace(" (futuro, diario)", "").replace(" (volatilidad del S&P 500)", "") : by[c].name_en.replace(" (futures, daily)", "").replace(" (S&P 500 volatility)", "")}</div>
                    <div className="v">{isRate ? `${num(by[c].last_value, lang, 2)}%` : num(by[c].last_value, lang, c === "bitcoin" ? 0 : 2)}</div>
                    {v != null && <div className={v >= 0 ? "up" : "down"} style={{ fontSize: 13 }}>{v >= 0 ? "▲" : "▼"} {pct(Math.abs(v), lang, 2, false)}</div>}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="section grid split">
        <div>
          <SectionHead label={d.bvcSection} href={`/${lang}/bvc`} more={d.seeMarket} />
          <ChartCard lang={lang} title={es ? "Índice IBC" : "IBC index"} date={ibc?.last_date ? fmtDateFor(ibc.last_date, "D", lang) : ""}
            series={[{ name: "IBC", points: ibcPts }]} unit="pts" height={190} area labels={chartLabels(lang)} rangeLabels={d.range}
            ranges={["1M", "3M", "YTD", "1A"]} initial="YTD" stats={{ periods: ["1D", "1W", "1M", "YTD"] }}
            footer={<>
            {[{ q: gain, l: d.topGain }, { q: loss, l: d.topLoss }].map(({ q, l }) => q && (
              <div key={l} style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                <div><div className="muted">{l}</div><Link href={`/${lang}/bvc/${q.symbol}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 18 }}>{q.symbol}{q.company ? ` · ${prettyName(q.company)}` : ""}</Link></div>
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
                {n.also.length > 0 && <p className="also">{es ? "También en: " : "Also in: "}{n.also.slice(0, 4).map((a, i) => <span key={a.url}>{i > 0 && " · "}<a href={a.url} target="_blank" rel="noreferrer">{a.source}</a></span>)}</p>}
              </li>
            ))}
            {!items.length && <li className="muted">{d.noData}</li>}
          </ul>
        </div>
      </section>

      <section className="section">
        <SectionHead label={es ? "Informes y descargas" : "Reports and downloads"} href={`/${lang}/informes`} more={es ? "Ver todos los informes" : "See all reports"} />
        <div className="grid home-dl">
          <Downloads lang={lang} compact />
          <Agenda lang={lang} />
        </div>
      </section>

      <section className="section">
        <SectionHead label={es ? "Conversor Bs / US$ / €" : "Bs / US$ / € converter"} href={`/${lang}/herramientas`} more={es ? "Calculadoras de inflación" : "Inflation calculators"} />
        <div>
          <Calculator only="fx" lang={lang} fx={{ usd_bcv: calc.usd_bcv ?? [], usd_paralelo: calc.usd_paralelo ?? [], eur_bcv: calc.eur_bcv ?? [] }} inflation={calc.inflacion_mensual ?? []} usCpi={calc.ipc_eeuu ?? []} />
        </div>
      </section>
    </>
  );
}
