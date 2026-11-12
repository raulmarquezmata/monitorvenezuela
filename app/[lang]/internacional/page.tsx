import Link from "next/link";
import MarketMap, { Movers } from "@/components/MarketMap";
import { chartLabels, Kpi, NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { configured, history, latest, sp500Map } from "@/lib/data";
import { dateTime, num } from "@/lib/format";
import { valueAt, type Point } from "@/lib/stats";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 300;

const TOP = ["sp500", "nasdaq", "dow_jones", "vix", "dxy", "oro_diario", "bitcoin", "ust_10a"];
const RATES = ["ust_2a", "ust_5a", "ust_10a", "ust_20a", "ust_30a"];
const REGION = ["eem", "bovespa", "merval", "ipc_mexico", "ipsa_chile"];

export default async function Internacional({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const [series, map] = await Promise.all([latest("internacional"), sp500Map()]);
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
        <Link className="btn" href={`/${lang}/noticias?cat=global`}>{es ? "Noticias de mercados globales →" : "Global markets news →"}</Link>
      </div>

      <div className="grid g4">{TOP.filter((c) => by[c]).map((c) => <Kpi key={c} s={by[c]} points={hist[c] ?? []} lang={lang} periods={["1D", "1W", "YTD"]} />)}</div>

      {map?.rows?.length ? (
        <section className="section">
          <SectionHead label={es ? "Mapa del S&P 500 por sector" : "S&P 500 map by sector"} />
          <div className="card">
            <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>{es
              ? `Cada cuadro es una empresa: el tamaño es su peso en el índice y el color, su rendimiento en el período. Pase el cursor para ver el detalle. Actualizado ${dateTime(map.updated, lang)}.`
              : `Each tile is a company: size is its index weight and color its return over the period. Hover for details. Updated ${dateTime(map.updated, lang)}.`}</p>
            <MarketMap rows={map.rows} lang={lang} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-top"><h3>{es ? "Mayores alzas y caídas del S&P 500" : "S&P 500 top gainers and losers"}</h3></div>
            <Movers rows={map.rows} lang={lang} />
          </div>
        </section>
      ) : null}

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

      <details className="card fold section">
        <summary><h3 style={{ display: "inline" }}>{es ? "Gráficos: bolsas y activos" : "Charts: equities and assets"}</h3> <span className="muted">· S&P 500, Nasdaq, Dow Jones, VIX, {es ? "dólar, oro" : "dollar, gold"}, bitcoin</span></summary>
        <div className="grid g2">{TOP.filter((c) => has(c) && c !== "ust_10a").map((c) => <SeriesCard key={c} s={by[c]} points={hist[c] ?? []} lang={lang} allowLog initial="1A" />)}</div>
      </details>

      {REGION.some(has) && (
        <details className="card fold" style={{ marginTop: 16 }}>
          <summary><h3 style={{ display: "inline" }}>{es ? "Emergentes y región" : "Emerging markets and the region"}</h3> <span className="muted">· {es ? "EEM, Bovespa, Merval, IPC México, IPSA Chile" : "EEM, Bovespa, Merval, Mexico IPC, Chile IPSA"}</span></summary>
          <div className="grid g2">{REGION.filter(has).map((c) => <SeriesCard key={c} s={by[c]} points={hist[c] ?? []} lang={lang} allowLog initial="1A" />)}</div>
        </details>
      )}
      {!series.length && <div className="empty">{es ? "Los datos internacionales aparecerán después de la primera corrida del robot." : "International data will appear after the robot's first run."}</div>}
    </>
  );
}
