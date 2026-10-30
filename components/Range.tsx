"use client";
import { createContext, useContext, useState } from "react";

export type Range = "1M" | "3M" | "YTD" | "1A" | "MAX";
export const RANGES: Range[] = ["1M", "3M", "YTD", "1A", "MAX"];
export const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 92, YTD: 0, "1A": 366, MAX: 1e6 };
const Ctx = createContext<{ range: Range; setRange: (r: Range) => void }>({ range: "1A", setRange: () => {} });

/** Rango de tiempo. Cada tarjeta tiene el suyo (ver CardScope). */
export function RangeProvider({ children, initial = "1A" }: { children: React.ReactNode; initial?: Range }) {
  const [range, setRange] = useState<Range>(initial);
  return <Ctx.Provider value={{ range, setRange }}>{children}</Ctx.Provider>;
}

export const useRange = () => useContext(Ctx);

export function RangeButtons({ labels, options = RANGES }: { labels: Record<string, string>; options?: Range[] }) {
  const { range, setRange } = useRange();
  return (
    <div className="ranges" role="group">
      {options.map((r) => (
        <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{labels[r] ?? r}</button>
      ))}
    </div>
  );
}

/** Fecha de corte del rango, contada desde el último dato ('YTD' = desde el 1 de enero de ese año). */
export function rangeCut(lastDate: string, range: Range): string {
  if (range === "YTD") return `${lastDate.slice(0, 4)}-01-01`;
  const last = Date.parse(`${lastDate}T00:00:00Z`);
  return new Date(last - RANGE_DAYS[range] * 864e5).toISOString().slice(0, 10);
}

/** Puntos dentro del rango, con un mínimo de puntos para series mensuales/anuales. */
export function windowed<T extends [string, number]>(pts: T[], range: Range, minPoints = 6): T[] {
  if (!pts.length || range === "MAX") return pts;
  const cut = rangeCut(pts[pts.length - 1][0], range);
  let i = pts.findIndex((p) => p[0] >= cut);
  if (i < 0) i = pts.length - 1;
  // YTD: incluye el último dato del año anterior como base
  if (range === "YTD" && i > 0) i -= 1;
  return pts.slice(Math.max(0, Math.min(i, pts.length - minPoints)));
}
