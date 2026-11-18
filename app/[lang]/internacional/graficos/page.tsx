import Link from "next/link";
import { NotConfigured, SectionHead, SeriesCard } from "@/components/ui";
import { configured, history, latest } from "@/lib/data";
import type { Lang } from "@/lib/i18n";

// página pesada (historia diaria completa): se arma al pedirla y reutiliza la misma caché de datos que Internacional
export const dynamic = "force-dynamic";

const GROUPS: { es: string; en: string; codes: string[] }[] = [
  { es: "Bolsas de EE.UU.", en: "US equities", codes: ["sp500", "nasdaq", "dow_jones", "vix"] },
  { es: "Dólar, oro, bitcoin y Tesoro a 10 años", en: "Dollar, gold, bitcoin and 10-year Treasury", codes: ["dxy", "oro_diario", "bitcoin", "ust_10a"] },
  { es: "Emergentes y región", en: "Emerging markets and the region", codes: ["eem", "bovespa", "ipc_mexico", "argentina_argt", "chile_ech"] },
];

export default async function Graficos({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const series = await latest("internacional");
  const hist = await history(series.map((s) => s.code), 12);
  const by = Object.fromEntries(series.map((s) => [s.code, s]));
  return (
    <>
      <div className="head-row">
        <div>
          <h1>{es ? "Gráficos: bolsas y activos" : "Charts: equities and assets"}</h1>
          <p className="sub">{es ? "Toda la historia diaria disponible (desde noviembre de 2016). Use los botones de rango para acercar, la escala logarítmica para comparar períodos largos y ⬇ Excel para descargar la serie."
            : "Full daily history available (since November 2016). Use the range buttons to zoom, log scale to compare long periods and ⬇ Excel to download the series."}</p>
        </div>
        <Link prefetch={false} className="btn" href={`/${lang}/internacional`}>{es ? "← Volver a Internacional" : "← Back to International"}</Link>
      </div>
      {GROUPS.map((g) => {
        const codes = g.codes.filter((c) => by[c] && (hist[c] ?? []).length);
        return codes.length ? (
          <section className="section" key={g.es}>
            <SectionHead label={es ? g.es : g.en} />
            <div className="grid g2">{codes.map((c) => <SeriesCard key={c} s={by[c]} points={hist[c] ?? []} lang={lang} allowLog initial="MAX" hiLo />)}</div>
          </section>
        ) : null;
      })}
    </>
  );
}
