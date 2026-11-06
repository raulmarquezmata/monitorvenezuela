import Link from "next/link";
import LineChart from "@/components/LineChart";
import { BarList, chartLabels, NotConfigured } from "@/components/ui";
import { configured, history, trade } from "@/lib/data";
import ChartCard from "@/components/ChartCard";
import { hsName } from "@/lib/hs";
import MacroNav from "@/components/MacroNav";
import { t, type Lang } from "@/lib/i18n";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";


export default async function Comercio({ params, searchParams }: { params: { lang: Lang }; searchParams: { year?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const [rows, mh] = await Promise.all([trade(), history(["exportaciones_espejo_mensual", "exportaciones_petroleras_espejo_mensual", "importaciones_espejo_mensual"], 3)]);
  if (!rows.length) return (<><MacroNav lang={lang} /><h1>{d.nav.trade}</h1><p className="sub">{d.mirrorNote}</p><div className="empty">{d.noData}</div></>);

  // Totales por año y flujo
  const tot: Record<string, Record<number, number>> = { X: {}, M: {} };
  const partnersByYear: Record<number, Set<number>> = {};
  for (const r of rows) {
    tot[r.flow][r.year] = (tot[r.flow][r.year] ?? 0) + r.value_usd;
    (partnersByYear[r.year] ??= new Set()).add(r.partner_code);
  }
  const years = Object.keys(partnersByYear).map(Number).sort();
  // año "completo" por defecto: el más reciente con al menos 60% de los socios del máximo
  const maxP = Math.max(...years.map((y) => partnersByYear[y].size));
  const fullYear = [...years].reverse().find((y) => partnersByYear[y].size >= maxP * 0.6) ?? years.at(-1)!;
  const year = searchParams.year && years.includes(+searchParams.year) ? +searchParams.year : fullYear;

  const agg = (flow: string, key: "hs2" | "partner") => {
    const m = new Map<string, { name: string; value: number }>();
    for (const r of rows) {
      if (r.year !== year || r.flow !== flow) continue;
      const k = key === "hs2" ? r.hs2 : r.partner;
      const name = key === "hs2" ? hsName(r.hs2, r.hs2_desc, lang) : r.partner;
      const cur = m.get(k) ?? { name, value: 0 };
      cur.value += r.value_usd / 1e6;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 12);
  };
  const es = lang === "es";
  const partial = (y: number) => partnersByYear[y].size < maxP * 0.6;
  const series = (flow: string) => years.filter((y) => tot[flow][y]).map((y) => [`${y}-12-31`, tot[flow][y] / 1e6] as [string, number]);

  return (
    <>
      <MacroNav lang={lang} />
      <h1>{d.nav.trade}</h1>
      <p className="sub">{d.mirrorNote}</p>
      {(mh.exportaciones_espejo_mensual ?? []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <ChartCard lang={lang} title={lang === "es" ? "Mes a mes (últimos 3 años)" : "Month by month (last 3 years)"} date={lang === "es" ? "millones US$" : "US$ million"} decimals={0} height={260}
            labels={chartLabels(lang)} rangeLabels={d.range} ranges={["YTD", "1A", "MAX"]} initial="1A" unit={lang === "es" ? "millones US$" : "US$ million"}
            series={[{ name: lang === "es" ? "Exportaciones (espejo)" : "Exports (mirror)", points: mh.exportaciones_espejo_mensual ?? [] },
              { name: lang === "es" ? "de ellas, petroleras" : "of which oil", points: mh.exportaciones_petroleras_espejo_mensual ?? [] },
              { name: lang === "es" ? "Importaciones (espejo)" : "Imports (mirror)", points: mh.importaciones_espejo_mensual ?? [] }]}
            footer={<p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{lang === "es"
              ? `Lo que los socios comerciales declaran a UN Comtrade cada mes. Los meses más recientes son parciales: faltan los socios que aún no reportan. Último mes con datos: ${(mh.exportaciones_espejo_mensual ?? []).at(-1)?.[0].slice(0, 7)}.`
              : `What trading partners report to UN Comtrade each month. Recent months are partial. Latest month: ${(mh.exportaciones_espejo_mensual ?? []).at(-1)?.[0].slice(0, 7)}.`}</p>} />
        </div>
      )}
      <div className="card">
        <div className="card-head"><h3>{d.exports} / {d.imports} {es ? "por año" : "by year"}</h3><span className="muted">{lang === "es" ? "millones US$" : "US$ million"}</span></div>
        <LineChart lang={lang} decimals={0} height={240} ignoreRange labels={chartLabels(lang)}
          series={[{ name: d.exports, points: series("X") }, { name: d.imports, points: series("M") }]} />
      </div>
      <section className="section">
        <div className="card-top" style={{ alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{es ? `Detalle por producto y por socio · ${year}` : `Detail by product and partner · ${year}`}</h2>
          <div className="chips" style={{ margin: 0 }}>
            {years.map((y) => <Link key={y} scroll={false} href={`/${lang}/comercio?year=${y}`} className={y === year ? "on" : ""}>{y}{partial(y) ? (es ? " · parcial" : " · partial") : ""}</Link>)}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 12px" }}>{partial(year)
          ? (es ? `${year} está incompleto: solo incluye lo que ya reportaron ${partnersByYear[year].size} de los ~${maxP} socios comerciales habituales, y solo los meses que cada uno ya publicó (los países tardan entre 2 y 12 meses en declarar a UN Comtrade). Sirve para ver la composición (qué se vende y a quién), no el total del año.`
                : `${year} is incomplete: it only includes what ${partnersByYear[year].size} of the usual ~${maxP} trading partners have reported so far, and only the months each one has published (countries take 2–12 months to report to UN Comtrade). Use it for the mix (what is sold and to whom), not the annual total.`)
          : (es ? "Los botones de año cambian solo estas cuatro tablas." : "The year buttons change only these four tables.")}</p>
      <div className="grid cards">
        <div className="card"><div className="card-head"><h3>{d.exports} {d.byProduct} · {year}</h3><span className="muted">MM US$</span></div><BarList lang={lang} items={agg("X", "hs2")} /></div>
        <div className="card"><div className="card-head"><h3>{d.imports} {d.byProduct} · {year}</h3><span className="muted">MM US$</span></div><BarList lang={lang} alt items={agg("M", "hs2")} /></div>
        <div className="card"><div className="card-head"><h3>{d.exports} {d.byPartner} · {year}</h3><span className="muted">MM US$</span></div><BarList lang={lang} items={agg("X", "partner")} /></div>
        <div className="card"><div className="card-head"><h3>{d.imports} {d.byPartner} · {year}</h3><span className="muted">MM US$</span></div><BarList lang={lang} alt items={agg("M", "partner")} /></div>
      </div>
      </section>
    </>
  );
}
