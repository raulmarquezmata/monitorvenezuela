import Link from "next/link";
import LineChart from "@/components/LineChart";
import { BarList, chartLabels, NotConfigured } from "@/components/ui";
import { agro, configured } from "@/lib/data";
import { num } from "@/lib/format";
import MacroNav from "@/components/MacroNav";
import { t, type Lang } from "@/lib/i18n";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";


export default async function Agro({ params, searchParams }: { params: { lang: Lang }; searchParams: { item?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const rows = await agro();
  if (!rows.length) return (<><MacroNav lang={lang} /><h1>{d.agroTitle}</h1><p className="sub">{d.agroNote}</p><div className="empty">{d.noData}</div></>);

  // USDA: campaña en curso y pronóstico (se revisa cada mes)
  const usda = rows.filter((r) => r.item_code >= 900000);
  const uYear = usda.length ? Math.max(...usda.filter((r) => r.element === "production").map((r) => r.year)) : 0;
  const uItems = Array.from(new Set(usda.filter((r) => r.year === uYear && r.element === "production" && r.value > 0).map((r) => r.item_code)));
  const uv = (code: number, el: string, y: number) => usda.find((r) => r.item_code === code && r.element === el && r.year === y)?.value;
  const uRows = uItems.map((c) => ({ code: c, name: usda.find((r) => r.item_code === c)!.item.replace("USDA · ", ""), prod: uv(c, "production", uYear), prev: uv(c, "production", uYear - 1),
    imp: uv(c, "imports", uYear), cons: uv(c, "consumption", uYear), stock: uv(c, "ending_stocks", uYear), unit: usda.find((r) => r.item_code === c && r.element === "production")?.unit ?? "" }))
    .sort((a, b) => (b.prod ?? 0) - (a.prod ?? 0));
  const uSel = searchParams.item && +searchParams.item >= 900000 ? +searchParams.item : uRows[0]?.code;
  const uSeries = (el: string) => usda.filter((r) => r.item_code === uSel && r.element === el).sort((a, b) => a.year - b.year).map((r) => [`${r.year}-12-31`, r.value] as [string, number]);
  const prod = rows.filter((r) => r.item_code < 900000 && r.element === "production" && /^t$|tonnes/i.test(r.unit));
  const lastYear = Math.max(...prod.map((r) => r.year));
  const top = prod.filter((r) => r.year === lastYear).sort((a, b) => b.value - a.value);
  const prevByItem = new Map(prod.filter((r) => r.year === lastYear - 1).map((r) => [r.item_code, r.value]));
  const itemCode = searchParams.item ? +searchParams.item : top[0]?.item_code;
  const item = top.find((r) => r.item_code === itemCode) ?? top[0];
  const pts = (el: string) => rows.filter((r) => r.item_code === item?.item_code && r.element === el).map((r) => [`${r.year}-12-31`, r.value] as [string, number]);

  return (
    <>
      <MacroNav lang={lang} />
      <h1>{d.agroTitle}</h1>
      <p className="sub">{lang === "es"
        ? `Producción, importaciones y consumo de Venezuela por campaña según el USDA (incluye el pronóstico ${uYear}/${String(uYear + 1).slice(2)}, revisado cada mes), y la historia por rubro de la FAO (anual, hasta ${lastYear}).`
        : `Venezuela's production, imports and consumption by marketing year per USDA (incl. the ${uYear}/${String(uYear + 1).slice(2)} forecast, revised monthly), and FAO history by product (annual, through ${lastYear}).`}</p>
      {uRows.length > 0 && (
        <div className="grid two" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-head"><h3>{lang === "es" ? `Campaña ${uYear}/${String(uYear + 1).slice(2)} · USDA` : `${uYear}/${String(uYear + 1).slice(2)} season · USDA`}</h3><span className="muted">{lang === "es" ? "miles t" : "thousand t"}</span></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>{d.item}</th><th>{d.production}</th><th>{lang === "es" ? "Var. %" : "Chg. %"}</th><th>{lang === "es" ? "Importaciones" : "Imports"}</th><th>{lang === "es" ? "Consumo" : "Consumption"}</th></tr></thead>
                <tbody>{uRows.map((r) => { const ch = r.prod && r.prev ? (r.prod / r.prev - 1) * 100 : null; return (
                  <tr key={r.code}><td><Link href={`/${lang}/agro?item=${r.code}`}>{r.name}</Link></td><td>{num(r.prod, lang, 0)}</td>
                    <td className={ch == null ? "" : ch >= 0 ? "up" : "down"}>{ch == null ? "—" : `${ch > 0 ? "+" : ""}${num(ch, lang, 1)}%`}</td><td>{num(r.imp, lang, 0)}</td><td>{num(r.cons, lang, 0)}</td></tr>); })}</tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{lang === "es" ? "Fuente: USDA, Production, Supply and Distribution (PSD). La campaña en curso es pronóstico y se revisa con cada informe WASDE (≈ el 10 de cada mes)." : "Source: USDA PSD. The current season is a forecast revised with each WASDE (≈10th of each month)."}</p>
          </div>
          <div className="card">
            <div className="card-head"><h3>{uRows.find((r) => r.code === uSel)?.name}</h3><span className="muted">{lang === "es" ? "miles t por campaña" : "thousand t per season"}</span></div>
            <LineChart lang={lang} decimals={0} height={300} ignoreRange labels={chartLabels(lang)}
              series={[{ name: d.production, points: uSeries("production") }, { name: lang === "es" ? "Importaciones" : "Imports", points: uSeries("imports") }, { name: lang === "es" ? "Consumo" : "Consumption", points: uSeries("consumption") }]} />
          </div>
        </div>
      )}
      <h2 style={{ margin: "8px 0 14px" }}>{lang === "es" ? `Historia por rubro · FAO (hasta ${lastYear})` : `History by product · FAO (through ${lastYear})`}</h2>
      <div className="grid two">
        <div className="card">
          <div className="card-head"><h3>{d.production} · {item?.item}</h3><span className="muted">t</span></div>
          <LineChart lang={lang} decimals={0} height={260} ignoreRange labels={chartLabels(lang)} series={[{ name: item?.item ?? "", points: pts("production") }]} />
          <div className="card-head" style={{ marginTop: 16 }}><h3>{d.area}</h3><span className="muted">ha</span></div>
          <LineChart lang={lang} decimals={0} height={180} ignoreRange labels={chartLabels(lang)} series={[{ name: d.area, points: pts("area") }]} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{lang === "es" ? "Principales rubros" : "Top products"} · {lastYear}</h3><span className="muted">{lang === "es" ? "miles t" : "thousand t"}</span></div>
          <BarList lang={lang} items={top.slice(0, 15).map((r) => ({ name: r.item, value: r.value / 1000 }))} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="tbl-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table>
            <thead><tr><th>{d.item}</th><th>{lastYear} (t)</th><th>{lastYear - 1} (t)</th><th>{lang === "es" ? "Var. %" : "Chg. %"}</th></tr></thead>
            <tbody>
              {top.map((r) => {
                const p = prevByItem.get(r.item_code);
                const ch = p ? (r.value / p - 1) * 100 : null;
                return (
                  <tr key={r.item_code}>
                    <td><Link href={`/${lang}/agro?item=${r.item_code}`}>{r.item}</Link></td>
                    <td>{num(r.value, lang, 0)}</td><td>{num(p, lang, 0)}</td>
                    <td className={ch == null ? "" : ch > 0 ? "up" : ch < 0 ? "down" : "flat"}>{ch == null ? "—" : `${ch > 0 ? "+" : ""}${num(ch, lang, 1)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
