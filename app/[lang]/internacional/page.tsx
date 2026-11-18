import Link from "next/link";
import MarketMap, { Movers } from "@/components/MarketMap";
import { Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import Agenda, { type Item as AgendaItem } from "@/components/Agenda";
import { FedNextCard, FedRateCard, FedTable, NfpCard, fedChanges } from "@/components/FedCards";
import { configured, earningsCal, fedMarket, history, latest, sp500Map } from "@/lib/data";
import { dateTime, num } from "@/lib/format";
import { valueAt, type Point } from "@/lib/stats";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 300;

const TOP = ["sp500", "nasdaq", "dow_jones", "vix", "dxy", "oro_diario", "bitcoin", "ust_10a"];
const RATES = ["ust_2a", "ust_5a", "ust_10a", "ust_20a", "ust_30a"];
const USA = ["eeuu_ipc_interanual", "eeuu_ipc_subyacente", "eeuu_nomina_no_agricola", "eeuu_desempleo"];
const FED = ["fed_tasa_objetivo"];

export default async function Internacional({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const [series, map, fed, earn] = await Promise.all([latest("internacional"), sp500Map(), fedMarket(), earningsCal()]);
  const hist = await history(series.map((s) => s.code), 12);
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  const has = (c: string) => (hist[c] ?? []).length > 0;
  // tasas: nivel y variación en puntos básicos
  const bps = (pts: Point[], days: number) => {
    const last = pts.at(-1);
    if (!last) return null;
    const ref = valueAt(pts, new Date(Date.parse(last[0]) - days * 864e5).toISOString().slice(0, 10));
    return ref ? Math.round((last[1] - ref[1]) * 100) : null;
  };
  const ytd = (pts: Point[]) => { const last = pts.at(-1); const ref = last ? valueAt(pts, `${Number(last[0].slice(0, 4)) - 1}-12-31`) : null; return last && ref ? Math.round((last[1] - ref[1]) * 100) : null; };
  const bpCell = (v: number | null) => <td className={v == null ? "" : v > 0 ? "down" : v < 0 ? "up" : ""} style={{ textAlign: "right" }}>{v == null ? "—" : `${v > 0 ? "+" : ""}${v} pb`}</td>;
  // curva hoy / hace 1 mes / hace 1 año
  const curve = (back: number) => RATES.map((c) => { const pts = hist[c] ?? []; const last = pts.at(-1); if (!last) return null; const v = back ? valueAt(pts, new Date(Date.parse(last[0]) - back * 864e5).toISOString().slice(0, 10)) : last; return v ? v[1] : null; });
  const curves = [{ name: es ? "Hoy" : "Today", v: curve(0), c: "var(--series-1)" }, { name: es ? "Hace 1 mes" : "1 month ago", v: curve(30), c: "var(--series-3)" }, { name: es ? "Hace 1 año" : "1 year ago", v: curve(365), c: "var(--text-3)" }];
  const allV = curves.flatMap((c) => c.v).filter((x): x is number => x != null);
  const lo = allV.length ? Math.floor(Math.min(...allV) * 4) / 4 - 0.25 : 0, hi = allV.length ? Math.ceil(Math.max(...allV) * 4) / 4 + 0.25 : 1;
  const CW = 520, CH = 220, X = (i: number) => 70 + (i * (CW - 90)) / (RATES.length - 1), Y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (CH - 40);
  const labelsY = ["2A", "5A", "10A", "20A", "30A"];
  return (
    <>
      <div className="head-row">
        <div>
          <h1>{d.nav.intl}</h1>
          <p className="sub">{es ? "Bolsas de EE.UU. y de la región, volatilidad, dólar, oro, bitcoin y tasas del Tesoro. Precios con ~15 minutos de retraso en horario de mercado."
            : "US and regional equities, volatility, the dollar, gold, bitcoin and Treasury yields. Prices delayed ~15 minutes during market hours."}</p>
        </div>
        <Link prefetch={false} className="btn" href={`/${lang}/noticias?cat=global`}>{es ? "Noticias de mercados globales →" : "Global markets news →"}</Link>
      </div>

      <div className="grid g4">{TOP.filter((c) => by[c]).map((c) => <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} periods={["1D", "1W", "YTD"]} href={`/${lang}/internacional/graficos#${c}`} />)}</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{es ? "Toque cualquier tarjeta para ver su gráfico con toda la historia (desde 2016)." : "Tap any card to see its full-history chart (since 2016)."} <Link prefetch={false} href={`/${lang}/internacional/graficos`}>{es ? "Ver todos los gráficos →" : "See all charts →"}</Link></p>

      {map?.rows?.length ? (
        <section className="section">
          <SectionHead label={es ? "Mapa del S&P 500 por sector" : "S&P 500 map by sector"} />
          <div className="card">
            <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>{es
              ? `Cada cuadro es una empresa: el tamaño es su peso en el índice y el color, su rendimiento en el período. Pase el cursor para ver el detalle. Actualizado ${dateTime(map.updated, lang).replace(/\.$/, "")}.`
              : `Each tile is a company: size is its index weight and color its return over the period. Hover for details. Updated ${dateTime(map.updated, lang)}.`}</p>
            <MarketMap rows={map.rows} lang={lang} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-top"><h3>{es ? "Mayores alzas y caídas del S&P 500" : "S&P 500 top gainers and losers"}</h3></div>
            <Movers rows={map.rows} lang={lang} />
          </div>
        </section>
      ) : null}

      {(USA.some(has) || FED.some(has)) && (() => {
        const next = fed?.meetings?.[0];
        const ch = fedChanges(hist.fed_tasa_objetivo ?? [], fed?.last_meeting);
        const earnItems: AgendaItem[] = earn.map((e) => ({ date: e.date, tipo: "empresa",
          es: `Resultados de ${e.name} (${e.symbol})${e.time === "pre" ? ", antes de la apertura" : e.time === "post" ? ", tras el cierre" : ""}`,
          en: `${e.name} (${e.symbol}) earnings${e.time === "pre" ? ", before the open" : e.time === "post" ? ", after the close" : ""}` }));
        return (
        <section className="section" id="fed">
          <SectionHead label={es ? "EE.UU.: inflación, empleo y la Fed" : "US: inflation, jobs and the Fed"} />
          <div className="grid g3">
            {USA.filter((c) => by[c] && has(c)).map((c) => (
              <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} href={`#${c}`} periods={c === "eeuu_nomina_no_agricola" ? [] : ["PREV", "YOY"]}
                extra={c === "eeuu_nomina_no_agricola" ? (() => { const a = hist.eeuu_nfp_publicado?.at(-1), e = hist.eeuu_nfp_esperado?.find((p) => p[0] === a?.[0]);
                  return a ? [{ label: es ? "Primera lectura" : "First print", value: a[1], unit: es ? " mil" : "k", decimals: 0 }, { label: es ? "Esperado" : "Expected", value: e?.[1] ?? null, unit: es ? " mil" : "k", decimals: 0 }] : undefined; })() : undefined} />))}
            {has("fed_tasa_objetivo") && <FedRateCard points={hist.fed_tasa_objetivo ?? []} lang={lang} lastMeeting={fed?.last_meeting} href="#fed_tasa_objetivo" />}
            <FedNextCard m={next} lang={lang} href="#fed-mercado" />
          </div>
          <div className="card split" style={{ marginTop: 20 }} id="fed-mercado">
            <div>
              <div className="card-top"><h3>{es ? "¿Qué espera el mercado de la Fed?" : "What the market expects from the Fed"}</h3>
                {fed?.updated && <span className="date">{dateTime(fed.updated, lang).replace(/\.$/, "")}</span>}</div>
              {fed?.meetings?.length ? <FedTable meetings={fed.meetings} lang={lang} />
                : <p className="muted">{es ? "Las probabilidades aparecerán tras la primera corrida del robot." : "Probabilities will appear after the robot's first run."}</p>}
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{es
                ? "Rango vigente: " + (fed?.current ? `${num(fed.current.lo, lang, 2)}–${num(fed.current.hi, lang, 2)}%` : "—") + ". Subir, mantener y bajar es lo que el mercado descuenta para cada reunión; el rango más probable acumula las reuniones anteriores. Cálculo propio con los futuros de fondos federales a 30 días (CME), por el método de CME FedWatch; puede diferir unos puntos del publicado por CME. Es lo que descuenta el mercado, no un pronóstico."
                : "Current range: " + (fed?.current ? `${num(fed.current.lo, lang, 2)}–${num(fed.current.hi, lang, 2)}%` : "—") + ". Hike, hold and cut are what the market prices for each meeting; the most likely range compounds earlier meetings. Our own calculation from 30-day fed funds futures (CME) using the CME FedWatch method; it may differ by a few points from CME's. It reflects market pricing, not a forecast."}</p>
            </div>
            <div><Agenda plain lang={lang} days={90} tipos={["eeuu", "fed", "empresa"]} max={16} extra={earnItems} title={es ? "Calendario de EE.UU." : "US calendar"} />
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{es ? "Incluye los resultados trimestrales de las 25 mayores empresas del S&P 500 (fechas de Nasdaq)." : "Includes quarterly earnings of the 25 largest S&P 500 companies (dates from Nasdaq)."}</p></div>
          </div>
          <details className="card fold" style={{ marginTop: 20 }} open>
            <summary><h3 style={{ display: "inline" }}>{es ? "Histórico: inflación, empleo y Fed" : "History: inflation, jobs and the Fed"}</h3> <span className="muted">· {es ? "IPC, subyacente, empleo, desempleo y tasa de la Fed" : "CPI, core, payrolls, unemployment and the Fed rate"}</span></summary>
            <div className="grid g2">
              {has("eeuu_nfp_publicado") && <NfpCard actual={hist.eeuu_nfp_publicado ?? []} expected={hist.eeuu_nfp_esperado ?? []} lang={lang} />}
              {[...USA, "eeuu_ipc_mensual"].filter((c) => by[c] && has(c)).map((c) => (
                <SeriesCard key={c} s={by[c]} points={hist[c] ?? []} lang={lang} bars={c === "eeuu_nomina_no_agricola" || c === "eeuu_ipc_mensual"} initial="MAX" clip={c === "eeuu_nomina_no_agricola"}
                  note={c === "eeuu_nomina_no_agricola" ? (es ? "Serie revisada del BLS (cambia con cada publicación). La comparación con lo esperado está en el gráfico de arriba." : "BLS revised series (changes with each release). The comparison with expectations is in the chart above.") : undefined} />))}
              {has("fed_tasa_objetivo") && by.fed_tasa_objetivo && <SeriesCard s={by.fed_tasa_objetivo} points={hist.fed_tasa_objetivo ?? []} lang={lang} initial="MAX" stats={false}
                extra={<div className="stats" style={{ marginTop: 8 }}>
                  <span className="st"><small>{es ? "Rango vigente" : "Current range"}</small><b>{num((hist.fed_tasa_objetivo?.at(-1)?.[1] ?? 0.25) - 0.25, lang, 2)}–{num(hist.fed_tasa_objetivo?.at(-1)?.[1], lang, 2)}%</b></span>
                  <span className="st"><small>{es ? "Última reunión" : "Last meeting"}</small><b className={ch.meeting ? (ch.meeting > 0 ? "down" : "up") : ""}>{ch.meeting == null ? "—" : ch.meeting === 0 ? (es ? "sin cambio" : "no change") : `${ch.meeting > 0 ? "+" : ""}${ch.meeting} pb`}</b></span>
                  <span className="st"><small>{es ? "En el año" : "YTD"}</small><b className={ch.ytd ? (ch.ytd > 0 ? "down" : "up") : ""}>{ch.ytd == null ? "—" : `${ch.ytd > 0 ? "+" : ""}${ch.ytd} pb`}</b></span>
                </div>} />}
            </div>
          </details>
        </section>
        );
      })()}

      {RATES.some(has) && (
        <section className="section">
          <SectionHead label={es ? "Tasas del Tesoro de EE.UU." : "US Treasury yields"} />
          <div className="card split">
            <div>
              <table className="tbl compact">
                <thead><tr><th>{es ? "Plazo" : "Tenor"}</th><th style={{ textAlign: "right" }}>{es ? "Rendimiento" : "Yield"}</th><th style={{ textAlign: "right" }}>{es ? "Día" : "Day"}</th><th style={{ textAlign: "right" }}>{es ? "Mes" : "Month"}</th><th style={{ textAlign: "right" }}>{es ? "Año" : "YTD"}</th></tr></thead>
                <tbody>{RATES.filter(has).map((c) => { const pts = hist[c] ?? []; return (
                  <tr key={c}><td>{es ? by[c]?.name_es.replace("Tesoro EE.UU. ", "") : by[c]?.name_en.replace("US Treasury ", "")}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{num(pts.at(-1)?.[1], lang, 2)}%</td>{bpCell(bps(pts, 1))}{bpCell(bps(pts, 30))}{bpCell(ytd(pts))}</tr>); })}</tbody>
              </table>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{es ? "Variaciones en puntos básicos (pb). Fuente: Departamento del Tesoro de EE.UU. (curva diaria)." : "Changes in basis points (bp). Source: US Treasury daily yield curve."}</p>
            </div>
            <div>
              <div className="card-top"><h3>{es ? "Curva de rendimientos" : "Yield curve"}</h3></div>
              <div className="legend" style={{ marginTop: 6 }}>{curves.map((c) => <span key={c.name}><i className="swatch" style={{ background: c.c }} />{c.name}</span>)}</div>
              <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: "100%", height: "auto" }}>
                {[lo, (lo + hi) / 2, hi].map((v) => <g key={v} className="axis"><line className="gridline" x1={56} x2={CW - 10} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeDasharray="2 3" /><text x={50} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-3)">{num(v, lang, 2)}%</text></g>)}
                {labelsY.map((l, i) => <text key={l} className="axis" x={X(i)} y={CH - 8} textAnchor="middle" fontSize={11} fill="var(--text-3)">{l}</text>)}
                {curves.map((c) => { const pts = c.v.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean) as number[][]; return pts.length > 1 && (
                  <g key={c.name}><path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("")} fill="none" stroke={c.c} strokeWidth={2} />
                    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={c.c} />)}</g>); })}
              </svg>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <Link prefetch={false} href={`/${lang}/internacional/graficos`} className="card" style={{ display: "block", textDecoration: "none" }}>
          <div className="card-top"><h3>{es ? "Gráficos de bolsas, activos y región →" : "Equity, asset and regional charts →"}</h3></div>
          <p className="muted" style={{ margin: "6px 0 0" }}>{es ? "S&P 500, Nasdaq, Dow Jones, VIX, dólar (DXY), oro, bitcoin, Bovespa, México, Argentina, Chile y emergentes, con toda la historia disponible." : "S&P 500, Nasdaq, Dow Jones, VIX, dollar (DXY), gold, bitcoin, Bovespa, Mexico, Argentina, Chile and emerging markets, with full history."}</p>
        </Link>
      </section>
      {!series.length && <div className="empty">{es ? "Los datos internacionales aparecerán después de la primera corrida del robot." : "International data will appear after the robot's first run."}</div>}
    </>
  );
}
