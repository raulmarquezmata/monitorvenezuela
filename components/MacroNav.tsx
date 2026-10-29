import { SubNav } from "./Nav";
import { MACRO, t, type Lang } from "@/lib/i18n";

export default function MacroNav({ lang }: { lang: Lang }) {
  const d = t(lang);
  const L = `/${lang}`;
  return (
    <SubNav items={[
      ...MACRO.map((c) => ({ href: `${L}/indicadores/${c}`, label: d.cat[c] })),
      { href: `${L}/comercio`, label: d.nav.trade },
      { href: `${L}/agro`, label: d.nav.agro },
      { href: `${L}/herramientas/comparador`, label: d.nav.compare },
      { href: `${L}/herramientas/calculadora`, label: d.nav.calc },
    ]} />
  );
}
