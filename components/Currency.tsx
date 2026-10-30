"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { BS_UNITS, isBsUnit, toUsd } from "@/lib/money";
export { isBsUnit, toUsd };

type Point = [string, number];
export type Cur = "BS" | "USD_BCV" | "USD_PAR";
type Fx = { bcv: Point[]; par: Point[] };
const Ctx = createContext<{ cur: Cur; setCur: (c: Cur) => void; fx: Fx }>({ cur: "BS", setCur: () => {}, fx: { bcv: [], par: [] } });

/** Moneda de presentación global: bolívares o dólares (al oficial BCV o al paralelo de cada fecha). */
export function CurrencyProvider({ fx, children }: { fx?: Fx; children: React.ReactNode }) {
  const parent = useContext(Ctx);
  const [cur, setCur] = useState<Cur>("BS");
  return <Ctx.Provider value={{ cur, setCur, fx: fx ?? parent.fx }}>{children}</Ctx.Provider>;
}
export const useCurrency = () => useContext(Ctx);

export function CurrencyButtons({ labels }: { labels: Record<Cur, string> }) {
  const { cur, setCur } = useCurrency();
  return (
    <div className="ranges" role="group" aria-label="Moneda">
      {(Object.keys(labels) as Cur[]).map((c) => <button key={c} className={c === cur ? "on" : ""} onClick={() => setCur(c)}>{labels[c]}</button>)}
    </div>
  );
}

/** Hook: devuelve puntos y unidad ya convertidos según la moneda elegida. */
export function useMoney(points: Point[], unitEs: string | null | undefined, unitShown: string, lang: "es" | "en") {
  const { cur, fx } = useCurrency();
  return useMemo(() => {
    if (cur === "BS" || !isBsUnit(unitEs)) return { points, unit: unitShown, converted: false, note: "" };
    const rate = cur === "USD_BCV" ? fx.bcv : fx.par;
    const u = BS_UNITS[unitEs!];
    const pts = toUsd(points, unitEs!, rate);
    const since = rate[0]?.[0];
    const note = lang === "es"
      ? `En dólares al ${cur === "USD_BCV" ? "oficial BCV" : "paralelo"} de cada fecha${since ? `, desde ${since.slice(0, 7)}` : ""}`
      : `In dollars at the ${cur === "USD_BCV" ? "official BCV" : "parallel"} rate of each date${since ? `, since ${since.slice(0, 7)}` : ""}`;
    return { points: pts, unit: lang === "es" ? u.usd : u.usdEn, converted: true, note };
  }, [cur, fx, points, unitEs, unitShown, lang]);
}
