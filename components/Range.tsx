"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Range = "1M" | "3M" | "1A" | "MAX";
export const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 92, "1A": 366, MAX: 1e6 };
const Ctx = createContext<{ range: Range; setRange: (r: Range) => void }>({ range: "1M", setRange: () => {} });

/** Rango de tiempo global (1M, 3M, 1A, Máx) compartido por todas las tarjetas y gráficos. */
export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, set] = useState<Range>("1M");
  useEffect(() => {
    try {
      const u = new URL(window.location.href).searchParams.get("r") ?? localStorage.getItem("range");
      if (u && u in RANGE_DAYS) set(u as Range);
    } catch {}
  }, []);
  const setRange = (r: Range) => {
    set(r);
    try {
      localStorage.setItem("range", r);
      const u = new URL(window.location.href);
      u.searchParams.set("r", r);
      window.history.replaceState(null, "", u.toString());
    } catch {}
  };
  return <Ctx.Provider value={{ range, setRange }}>{children}</Ctx.Provider>;
}

export const useRange = () => useContext(Ctx);

export function RangeButtons({ labels }: { labels: Record<Range, string> }) {
  const { range, setRange } = useRange();
  return (
    <div className="ranges" role="group">
      {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
        <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{labels[r]}</button>
      ))}
    </div>
  );
}

/** Puntos dentro del rango, con un mínimo de puntos para series mensuales/anuales. */
export function windowed<T extends [string, number]>(pts: T[], range: Range, minPoints = 6): T[] {
  if (!pts.length) return pts;
  const last = Date.parse(`${pts[pts.length - 1][0]}T00:00:00Z`);
  const cut = new Date(last - RANGE_DAYS[range] * 864e5).toISOString().slice(0, 10);
  let i = pts.findIndex((p) => p[0] >= cut);
  if (i < 0) i = pts.length - 1;
  return pts.slice(Math.max(0, Math.min(i, pts.length - minPoints)));
}
