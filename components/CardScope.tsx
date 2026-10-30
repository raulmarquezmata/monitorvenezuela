"use client";
import { CurrencyButtons, CurrencyProvider } from "./Currency";
import { RangeButtons, RangeProvider, RANGES, type Range } from "./Range";

/** Cada tarjeta lleva su propio rango y, si la serie está en bolívares, su propia moneda. */
export function CardScope({ children, initial = "1A" }: { children: React.ReactNode; initial?: Range }) {
  return <RangeProvider initial={initial}><CurrencyProvider>{children}</CurrencyProvider></RangeProvider>;
}

export function CardControls({ lang, money = false, ranges = RANGES, rangeLabels }: {
  lang: "es" | "en"; money?: boolean; ranges?: Range[] | null; rangeLabels: Record<string, string>;
}) {
  const es = lang === "es";
  return (
    <div className="card-controls">
      {money && <CurrencyButtons labels={{ BS: "Bs", USD_BCV: es ? "US$ oficial" : "US$ official", USD_PAR: es ? "US$ paralelo" : "US$ parallel" }} />}
      {ranges && ranges.length > 0 && <RangeButtons labels={rangeLabels} options={ranges} />}
    </div>
  );
}
