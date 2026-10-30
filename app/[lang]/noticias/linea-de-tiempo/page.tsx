import Link from "next/link";
import { Sparkline } from "@/components/Kpi";
import NewsNav from "@/components/NewsNav";
import { NotConfigured } from "@/components/ui";
import { configured, events, history, latest, type Event } from "@/lib/data";
import { num, fmtDateFor } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { MONTHS } from "@/lib/hemeroteca";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";

const CATS = ["politica", "economia", "precios", "cambiario", "petroleo", "sanciones", "mercados", "banca"];

export default async function Timeline({ params, searchParams }: { params: { lang: Lang }; searchParams: { cat?: string; y?: string } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const year = Number(searchParams.y) || new Date().getFullYear();
  const cat = searchParams.cat && CATS.includes(searchParams.cat) ? searchParams.cat : undefined;
  let evs = await events(500, year);
  if (cat) evs = evs.filter((e) => e.category === cat);
  const codes = Array.from(new Set(evs.map((e) => e.series_code).filter(Boolean))) as string[];
  const [hist, meta] = await Promise.all([history(codes, 3), latest()]);
  const metaBy = Object.fromEntries(meta.map((m) => [m.code, m]));
  const months = new Map<string, Event[]>();
  for (const e of evs) { const k = e.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k)!.push(e); }
  const monthName = (k: string) => new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${k}-15T12:00:00Z`));

  const stat = (e: Event) => {
    if (!e.series_code) return null;
    const pts = hist[e.series_code] ?? [];
    const m = metaBy[e.series_code];
    if (!pts.length || !m) return null;
    const win = pts.filter((p) => Math.abs(Date.parse(p[0]) - Date.parse(e.date)) < 150 * 864e5);
    const at = [...pts].reverse().find((p) => p[0] <= e.date.slice(0, 7) + "-31") ?? pts[0];
    return (
      <div className="tl-stat">
        <span>{es ? m.name_es : m.name_en}</span>
        <b>{num(at[1], lang, Math.min(m.decimals, 2))} <small style={{ fontSize: 13, color: "var(--text-3)" }}>{es ? m.unit_es : m.unit_en}</small></b>
        <Sparkline points={win.length > 1 ? win : pts.slice(-12)} w={200} h={40} />
      </div>
    );
  };

  return (
    <>
      <NewsNav lang={lang} />
      <h1>{d.nav.timeline} {year}</h1>
      <p className="sub">{es ? "Los hechos que marcaron el año, con el dato y el gráfico de cada momento. Se alimenta de eventos seleccionados y de los datos que publican BCV, OPEP y OFAC." : "The year's defining events, each with its data point and chart. Fed by curated events and by BCV, OPEC and OFAC releases."}</p>
      <div className="chips">
        <Link href={`/${lang}/noticias/linea-de-tiempo?y=${year}`} className={!cat ? "on" : ""}>{d.all}</Link>
        {CATS.map((c) => <Link key={c} href={`/${lang}/noticias/linea-de-tiempo?y=${year}&cat=${c}`} className={cat === c ? "on" : ""}>{d.cats[c] ?? c}</Link>)}
      </div>
      {evs.length ? (
        <div className="timeline">
          {[...months.entries()].map(([k, list]) => (
            <div key={k}>
              <div className="tl-month" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>{monthName(k)}</span>
                {MONTHS.includes(k) && <Link href={`/${lang}/noticias/hemeroteca?m=${k}`} style={{ fontSize: 14, fontWeight: 400 }}>{es ? "Noticias del mes →" : "Month's news →"}</Link>}
              </div>
              {list.map((e) => (
                <article key={e.id} className={`tl-item i${e.importance}`}>
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="tag">{d.cats[e.category ?? ""] ?? e.category}</span>
                      <span className="date">{fmtDateFor(e.date, e.precision === "month" ? "M" : "D", lang)}</span>
                      {e.origin === "automatico" && <span className="method">{es ? "dato" : "data"}</span>}
                    </div>
                    <h3>{e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{es ? e.title_es : e.title_en ?? e.title_es}</a> : (es ? e.title_es : e.title_en ?? e.title_es)}</h3>
                    {es && e.body_es && <p>{e.body_es}</p>}
                  </div>
                  {stat(e)}
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : <div className="empty">{d.noData}</div>}
      <p className="muted" style={{ marginTop: 24 }}>
        <Link href={`/${lang}/noticias/linea-de-tiempo?y=${year - 1}`}>← {year - 1}</Link>
      </p>
    </>
  );
}
