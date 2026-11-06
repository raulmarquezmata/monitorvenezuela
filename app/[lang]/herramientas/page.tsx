import Calculator from "@/components/Calculator";
import Comparator from "@/components/Comparator";
import { chartLabels, NotConfigured } from "@/components/ui";
import { configured, history, latest } from "@/lib/data";
import { t, type Lang } from "@/lib/i18n";

// el comparador lee las series elegidas de la URL (?s=)
export const dynamic = "force-dynamic";

/** Herramientas: calculadora cambiaria/inflación y comparador de series en una sola página. */
export default async function ToolsPage({ params, searchParams }: { params: { lang: Lang }; searchParams: { s?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const es = lang === "es";
  const [h, meta0] = await Promise.all([history(["usd_bcv", "usd_paralelo", "eur_bcv", "inflacion_mensual", "ipc_eeuu"], 40), latest()]);
  const meta = meta0.filter((s) => s.last_date);
  const series = meta.map((s) => ({ code: s.code, name: es ? s.name_es : s.name_en, unit: (es ? s.unit_es : s.unit_en) ?? "", category: s.category, catName: d.cat[s.category as keyof typeof d.cat] ?? s.category }));
  const initial = (searchParams.s ?? "usd_paralelo,ibc,liquidez_m2").split(",").filter((c) => series.some((s) => s.code === c)).slice(0, 4);
  return (
    <>
      <h1>{d.nav.tools}</h1>
      <p className="sub">{es ? "Convierta montos entre bolívares y dólares a cualquier fecha, ajuste por inflación y compare la trayectoria de cualquier serie del Radar."
        : "Convert amounts between bolivars and dollars on any date, adjust for inflation and compare the path of any series in the Radar."}</p>

      <section className="section" id="calculadora">
        <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>{es ? "Calculadora cambiaria e inflación" : "FX and inflation calculator"}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>{es ? "Tasas oficiales del BCV por fecha valor y mercado alternativo promedio; inflación del INPC." : "BCV official rates by value date and average alternative-market rate; CPI inflation."}</p>
        <Calculator lang={lang} fx={{ usd_bcv: h.usd_bcv ?? [], usd_paralelo: h.usd_paralelo ?? [], eur_bcv: h.eur_bcv ?? [] }} inflation={h.inflacion_mensual ?? []} usCpi={h.ipc_eeuu ?? []} />
      </section>

      <section className="section" id="comparador">
        <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>{es ? "Comparador de series" : "Series comparator"}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>{es ? "Elija hasta 4 series. En base 100 todas parten de 100 al inicio del período, para comparar trayectorias con unidades distintas." : "Pick up to 4 series. Indexed to 100 at the start of the period so different units can be compared."}</p>
        <div className="card">
          <Comparator lang={lang} series={series} initial={initial} labels={{
            add: es ? "+ Agregar serie" : "+ Add series", base100: es ? "Base 100" : "Index = 100", level: es ? "Niveles" : "Levels",
            sameUnit: es ? "Niveles solo con series de la misma unidad." : "Levels only for series with the same unit.",
            hint: es ? "Base 100 = valor al inicio del período elegido." : "Index 100 = value at the start of the chosen period.",
            remove: es ? "Quitar" : "Remove", download: d.download, chart: chartLabels(lang),
          }} />
        </div>
      </section>
    </>
  );
}
