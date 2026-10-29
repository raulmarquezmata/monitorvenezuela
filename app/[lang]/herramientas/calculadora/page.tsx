import Calculator from "@/components/Calculator";
import { NotConfigured } from "@/components/ui";
import { configured, history } from "@/lib/data";
import MacroNav from "@/components/MacroNav";
import type { Lang } from "@/lib/i18n";

export const revalidate = 600;

export default async function CalculatorPage({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  if (!configured) return <NotConfigured />;
  const h = await history(["usd_bcv", "usd_paralelo", "eur_bcv", "inflacion_mensual"], 10);
  const es = lang === "es";
  return (
    <>
      <MacroNav lang={lang} />
      <h1>{es ? "Calculadora cambiaria e inflación" : "FX and inflation calculator"}</h1>
      <p className="sub">{es ? "Tasas oficiales del BCV por fecha valor y paralelo promedio; inflación del INPC." : "BCV official rates by value date and average parallel rate; CPI inflation."}</p>
      <Calculator lang={lang} fx={{ usd_bcv: h.usd_bcv, usd_paralelo: h.usd_paralelo, eur_bcv: h.eur_bcv }} inflation={h.inflacion_mensual} />
    </>
  );
}
