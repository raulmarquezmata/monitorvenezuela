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

  const prod = rows.filter((r) => r.element === "production" && /^t$|tonnes/i.test(r.unit));
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
      <p className="sub">{d.agroNote} · {lastYear}</p>
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
