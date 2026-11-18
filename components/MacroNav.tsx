"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";

/** Macro en 4 grupos; dentro de cada grupo, sus apartados. */
const GROUPS = (L: string, es: boolean) => [
  { key: "economia", label: es ? "Economía" : "Economy", items: [
    { href: `${L}/indicadores/cambiario`, label: es ? "Cambiario" : "FX", d: es ? "Dólar oficial y alternativo, euro, brecha e intervención del BCV" : "Official and alternative dollar, euro, gap and BCV intervention" },
    { href: `${L}/indicadores/monetario`, label: es ? "Monetario" : "Monetary", d: es ? "Liquidez, base monetaria, multiplicador, encaje y tasas" : "Money supply, monetary base, multiplier, reserve requirement and rates" },
    { href: `${L}/indicadores/precios`, label: es ? "Precios" : "Prices", d: es ? "Inflación mensual, acumulada e interanual del BCV" : "BCV monthly, cumulative and annual inflation" },
    { href: `${L}/indicadores/actividad`, label: es ? "Actividad y fiscal" : "Activity & fiscal", d: es ? "PIB trimestral (petrolero y no petrolero) y recaudación del SENIAT" : "Quarterly GDP (oil and non-oil) and SENIAT tax collection" },
  ] },
  { key: "petroleo", label: es ? "Petróleo y materias primas" : "Oil & commodities", items: [
    { href: `${L}/indicadores/petroleo`, label: es ? "Petróleo y gas" : "Oil & gas", d: es ? "Producción de crudo, cesta Merey, Brent, WTI y gas" : "Crude output, Merey basket, Brent, WTI and gas" },
    { href: `${L}/indicadores/commodities`, label: es ? "Materias primas" : "Commodities", d: es ? "Oro, hierro, aluminio, granos, café, cacao y fertilizantes" : "Gold, iron ore, aluminum, grains, coffee, cocoa and fertilizers" },
    { href: `${L}/agro`, label: "Agro", d: es ? "Producción, importaciones y consumo de alimentos de Venezuela (USDA)" : "Venezuela food production, imports and consumption (USDA)" },
  ] },
  { key: "externo", label: es ? "Sector externo" : "External sector", items: [
    { href: `${L}/indicadores/externo`, label: es ? "Reservas y balanza de pagos" : "Reserves & balance of payments", d: es ? "Reservas del BCV, exportaciones petroleras y balanza de pagos" : "BCV reserves, oil exports and balance of payments" },
    { href: `${L}/comercio`, label: es ? "Comercio exterior" : "Foreign trade", d: es ? "Qué vende y compra Venezuela y a quién, según sus socios (estimación)" : "What Venezuela sells and buys, and with whom, per its partners (estimate)" },
    { href: `${L}/indicadores/deuda`, label: es ? "Deuda" : "Debt", d: es ? "Riesgo país (EMBI) y precios de los bonos de la República y PDVSA" : "Country risk (EMBI) and Republic and PDVSA bond prices" },
  ] },
  { key: "banca", label: es ? "Banca" : "Banking", items: [{ href: `${L}/indicadores/banca`, label: es ? "Banca" : "Banking", d: es ? "Créditos, captaciones y ranking de bancos" : "Loans, deposits and bank ranking" }] },
];

export default function MacroNav({ lang }: { lang: Lang }) {
  const path = usePathname();
  const L = `/${lang}`;
  const groups = GROUPS(L, lang === "es");
  const active = groups.find((g) => g.items.map((i) => i.href).some((h) => path.startsWith(h))) ?? groups[0];
  return (
    <div className="macronav">
      <nav className="subnav groups">
        {groups.map((g) => <Link prefetch={false} key={g.key} href={g.items[0].href} className={g === active ? "on" : ""}>{g.label}</Link>)}
      </nav>
      {active.items.length > 1 && (
        <nav className="subnav sub">
          {active.items.map((i) => <Link prefetch={false} key={i.href} href={i.href} className={path.startsWith(i.href) ? "on" : ""}>{i.label}</Link>)}
        </nav>
      )}
    </div>
  );
}
