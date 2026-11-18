import ShareWA from "./ShareWA";
import StockReportPicker from "./StockReportPicker";
import { bvcLatest, dailyReportUrl, mktcapReportUrl, stockReportUrl, weeklyReportUrl } from "@/lib/data";
import { prettyName } from "@/lib/names";
import { dl } from "@/lib/dl";
import type { Lang } from "@/lib/i18n";

/** Devuelve la URL solo si el archivo ya existe en Storage. */
async function existing(u: string | null): Promise<string | null> {
  if (!u) return null;
  try { const r = await fetch(u, { method: "HEAD", next: { revalidate: 600 } }); return r.ok ? u : null; } catch { return null; }
}

/** Informes PDF descargables (cierre del día, capitalización, semanal y por empresa) + aviso de descargas en Excel. */
export default async function Downloads({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const es = lang === "es";
  const rv = await bvcLatest("RV");
  const session = rv.reduce((a, r) => (r.date > a ? r.date : a), "");
  const ver = `${session}-${Math.floor(Date.now() / 6e5)}`;
  const [daily, mk, weekly] = await Promise.all([existing(dailyReportUrl(lang, ver)), existing(mktcapReportUrl(lang, ver)), existing(weeklyReportUrl(lang, ver))]);
  const seen = new Set<string>();
  const companies = [...rv].sort((a, b) => a.symbol.localeCompare(b.symbol)).filter((r) => !seen.has(r.symbol) && seen.add(r.symbol))
    .map((r) => ({ symbol: r.symbol, name: prettyName(r.company ?? r.name), url: stockReportUrl(r.symbol, lang, session) ?? "" })).filter((x) => x.url);
  const docs = [
    { url: daily, t: es ? "Cierre de la BVC" : "BVC close", d: es ? "Todas las acciones que operaron hoy: apertura, cierre en Bs y US$, variación del día y de la semana. Sale tras el cierre." : "Every stock traded today: open, close in Bs and US$, daily and weekly change. Published after the close." },
    { url: mk, t: es ? "Capitalización de mercado" : "Market capitalization", d: es ? "Ranking de todas las empresas por capitalización, en US$ alternativo y oficial, con su peso en el total." : "All companies ranked by market cap, in alternative and official US$, with their weight in the total." },
    { url: weekly, t: es ? "Radar semanal" : "Weekly Radar", d: es ? "Resumen de la semana: dólar y brecha, IBC, acciones destacadas, datos publicados, petróleo y mercados internacionales. Cada viernes." : "The week in review: FX and gap, IBC, top stocks, data releases, oil and global markets. Every Friday." },
  ];
  return (
    <div className="card">
      <div className="card-top"><h3>{es ? "Informes para descargar" : "Reports to download"}</h3><span className="date">PDF</span></div>
      <p className="muted" style={{ fontSize: 14, margin: "6px 0 0" }}>{es
        ? "Informes listos para leer, imprimir o reenviar a clientes: se generan solos con los datos del día. Para trabajar los números (filtrar, graficar, cruzar), use los archivos Excel de abajo."
        : "Ready-to-read reports to print or forward to clients, generated automatically from the day's data. To work with the numbers (filter, chart, combine), use the Excel files below."}</p>
      <div className={compact ? "dl-list compact" : "dl-list"}>
        {docs.map((x) => (
          <div key={x.t} className="dl-item">
            <div><b>{x.t}</b><p className="muted">{x.d}</p></div>
            {x.url ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><a className="btn primary" href={dl(x.url, `pdf:${x.t}`)} target="_blank" rel="noreferrer">⬇ PDF</a><ShareWA text={`${x.t} · Radar Solfin`} url={x.url} label="" /></span>
              : <span className="muted" style={{ fontSize: 13 }}>{x.t === (es ? "Radar semanal" : "Weekly Radar") ? (es ? "Sale el viernes, tras el cierre" : "Out Friday, after the close") : (es ? "Disponible tras el cierre" : "Available after the close")}</span>}
          </div>
        ))}
        <div className="dl-item">
          <div><b>{es ? "Informe por empresa" : "Company report"}</b><p className="muted">{es ? "Precio en Bs y en US$ desde 2025, rendimientos, valoración y descripción de la empresa." : "Price in Bs and US$ since 2025, returns, valuation and company profile."}</p></div>
          <StockReportPicker items={companies} lang={lang} />
        </div>
      </div>
      <div className="card-top" style={{ marginTop: 22 }}><h3>{es ? "Datos en Excel" : "Excel data"}</h3><span className="date">XLSX · CSV</span></div>
      <div className={compact ? "dl-list compact" : "dl-list"}>
        {[
          { t: es ? "Acciones: última sesión" : "Equities: last session", d: es ? "Precio, variación, volumen, monto y capitalización de cada acción. Para armar su propia tabla o filtrar." : "Price, change, volume, amount and market cap for every stock. Build your own table or filter.", h: `/api/export?bvc=RV&format=xlsx&lang=${lang}` },
          { t: es ? "Capitalización por empresa" : "Market cap by company", d: es ? "Ranking de empresas (clases A y B sumadas) en Bs y en US$ oficial y alternativo, con su peso." : "Company ranking (A and B classes combined) in Bs and official and alternative US$, with weights.", h: `/api/export?bvc=mktcap&format=xlsx&lang=${lang}` },
          { t: es ? "Renta fija: última sesión" : "Fixed income: last session", d: es ? "Papeles comerciales, obligaciones y títulos de participación negociados." : "Commercial paper, bonds and participation notes traded.", h: `/api/export?bvc=RF&format=xlsx&lang=${lang}` },
          { t: es ? "Índices y montos (histórico)" : "Indices and turnover (history)", d: es ? "IBC, índices sectoriales y monto negociado diario desde 2020." : "IBC, sector indices and daily turnover since 2020.", h: `/api/export?category=mercados&format=xlsx&lang=${lang}` },
        ].map((x) => (
          <div key={x.t} className="dl-item"><div><b>{x.t}</b><p className="muted">{x.d}</p></div><a className="btn" href={dl(x.h, `excel:${x.t}`)}>⬇ Excel</a></div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "14px 0 0" }}>📊 {es
        ? "El histórico de precios de una acción está en su ficha (clic en la fila de la tabla → «⬇ Excel»). Además, cada gráfico del Radar tiene su propio botón «⬇ Excel» abajo a la derecha."
        : "A stock's price history is on its page (click its row → «⬇ Excel»). Every chart in the Radar also has its own «⬇ Excel» button at the bottom right."}</p>
    </div>
  );
}
