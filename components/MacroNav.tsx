"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";

/** Macro en 4 grupos; dentro de cada grupo, sus apartados. */
const GROUPS = (L: string, es: boolean) => [
  { key: "economia", label: es ? "Economía" : "Economy", items: [
    { href: `${L}/indicadores/cambiario`, label: es ? "Cambiario" : "FX" },
    { href: `${L}/indicadores/monetario`, label: es ? "Monetario" : "Monetary" },
    { href: `${L}/indicadores/precios`, label: es ? "Precios" : "Prices" },
    { href: `${L}/indicadores/actividad`, label: es ? "Actividad y fiscal" : "Activity & fiscal" },
  ] },
  { key: "petroleo", label: es ? "Petróleo y materias primas" : "Oil & commodities", items: [
    { href: `${L}/indicadores/petroleo`, label: es ? "Petróleo y gas" : "Oil & gas" },
  ], extra: [`${L}/indicadores/commodities`, `${L}/agro`] },
  { key: "externo", label: es ? "Sector externo" : "External sector", items: [
    { href: `${L}/indicadores/externo`, label: es ? "Balanza de pagos" : "Balance of payments" },
    { href: `${L}/comercio`, label: es ? "Comercio exterior" : "Foreign trade" },
    { href: `${L}/indicadores/deuda`, label: es ? "Deuda" : "Debt" },
  ] },
  { key: "banca", label: es ? "Banca" : "Banking", items: [{ href: `${L}/indicadores/banca`, label: es ? "Banca" : "Banking" }] },
];

export default function MacroNav({ lang }: { lang: Lang }) {
  const path = usePathname();
  const L = `/${lang}`;
  const groups = GROUPS(L, lang === "es");
  const active = groups.find((g) => g.items.map((i) => i.href).some((h) => path.startsWith(h))) ?? groups[0];
  return (
    <div className="macronav">
      <nav className="subnav groups">
        {groups.map((g) => <Link key={g.key} href={g.items[0].href} className={g === active ? "on" : ""}>{g.label}</Link>)}
      </nav>
      {active.items.length > 1 && (
        <nav className="subnav sub">
          {active.items.map((i) => <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? "on" : ""}>{i.label}</Link>)}
        </nav>
      )}
    </div>
  );
}
