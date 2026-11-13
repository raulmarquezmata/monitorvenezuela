import ShareWA from "./ShareWA";
import StockReportPicker from "./StockReportPicker";
import { bvcLatest, dailyReportUrl, mktcapReportUrl, stockReportUrl, weeklyReportUrl } from "@/lib/data";
import { prettyName } from "@/lib/names";
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
      <div className={compact ? "dl-list compact" : "dl-list"}>
        {docs.map((x) => (
          <div key={x.t} className="dl-item">
            <div><b>{x.t}</b><p className="muted">{x.d}</p></div>
            {x.url ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><a className="btn primary" href={x.url} target="_blank" rel="noreferrer">⬇ PDF</a><ShareWA text={`${x.t} · Radar Grupo Solfin`} url={x.url} label="" /></span>
              : <span className="muted" style={{ fontSize: 13 }}>{x.t === (es ? "Radar semanal" : "Weekly Radar") ? (es ? "Sale el viernes, tras el cierre" : "Out Friday, after the close") : (es ? "Disponible tras el cierre" : "Available after the close")}</span>}
          </div>
        ))}
        <div className="dl-item">
          <div><b>{es ? "Informe por empresa" : "Company report"}</b><p className="muted">{es ? "Precio en Bs y en US$ desde 2025, rendimientos, valoración y descripción de la empresa." : "Price in Bs and US$ since 2025, returns, valuation and company profile."}</p></div>
          <StockReportPicker items={companies} lang={lang} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "14px 0 0" }}>📊 {es
        ? "Además, todas las series y tablas del Radar se pueden descargar en Excel con el botón «⬇ Excel» de cada gráfico o tabla."
        : "Every series and table in the Radar can also be downloaded to Excel with the «⬇ Excel» button on each chart or table."}</p>
    </div>
  );
}
