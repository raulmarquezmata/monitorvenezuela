import Comparator from "@/components/Comparator";
import { chartLabels, NotConfigured } from "@/components/ui";
import { configured, latest } from "@/lib/data";
import MacroNav from "@/components/MacroNav";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 3600;

export default async function ComparatorPage({ params, searchParams }: { params: { lang: Lang }; searchParams: { s?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const meta = (await latest()).filter((s) => s.last_date);
  const series = meta.map((s) => ({ code: s.code, name: lang === "es" ? s.name_es : s.name_en, unit: (lang === "es" ? s.unit_es : s.unit_en) ?? "", category: s.category, catName: d.cat[s.category as keyof typeof d.cat] ?? s.category }));
  const initial = (searchParams.s ?? "usd_paralelo,ibc,liquidez_m2").split(",").filter((c) => series.some((s) => s.code === c)).slice(0, 4);
  const es = lang === "es";
  return (
    <>
      <MacroNav lang={lang} />
      <h1>{es ? "Comparador de series" : "Series comparator"}</h1>
      <p className="sub">{es ? "Elija hasta 4 series. En base 100 todas parten de 100 al inicio del período, para comparar trayectorias con unidades distintas." : "Pick up to 4 series. Indexed to 100 at the start of the period so different units can be compared."}</p>
      <div className="card">
        <Comparator lang={lang} series={series} initial={initial} labels={{
          add: es ? "+ Agregar serie" : "+ Add series", base100: es ? "Base 100" : "Index = 100", level: es ? "Niveles" : "Levels",
          sameUnit: es ? "Niveles solo con series de la misma unidad." : "Levels only for series with the same unit.",
          hint: es ? "Base 100 = valor al inicio del período elegido." : "Index 100 = value at the start of the chosen period.",
          remove: es ? "Quitar" : "Remove", download: d.download, chart: chartLabels(lang),
        }} />
      </div>
    </>
  );
}
