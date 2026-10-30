/** Variaciones de una serie respecto a fechas de referencia (sirve en servidor y en cliente). */
export type Point = [string, number];
export type Period = "1D" | "1W" | "1M" | "PREV" | "YTD" | "YOY";

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const shift = (d: string, days = 0, months = 0, years = 0) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCFullYear(x.getUTCFullYear() + years, x.getUTCMonth() + months, x.getUTCDate() + days);
  return iso(x.getTime());
};

/** Último valor con fecha ≤ d. */
export function valueAt(pts: Point[], d: string): Point | undefined {
  let lo = 0, hi = pts.length - 1, ans: Point | undefined;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= d) { ans = pts[m]; lo = m + 1; } else hi = m - 1; }
  return ans;
}

export function refPoint(pts: Point[], p: Period): Point | undefined {
  const last = pts.at(-1);
  if (!last) return;
  const d = last[0];
  switch (p) {
    case "1D": case "PREV": return pts.at(-2);
    case "1W": return valueAt(pts, shift(d, -7));
    case "1M": return valueAt(pts, shift(d, 0, -1));
    case "YTD": return valueAt(pts, `${Number(d.slice(0, 4)) - 1}-12-31`);
    case "YOY": return valueAt(pts, shift(d, 0, 0, -1));
  }
}

/** Variación % (o en puntos si `points` es true) entre el último dato y la referencia del período. */
export function change(pts: Point[], p: Period, points = false): number | null {
  const last = pts.at(-1), ref = refPoint(pts, p);
  if (!last || !ref || ref === last) return null;
  if (points) return last[1] - ref[1];
  return ref[1] ? (last[1] / ref[1] - 1) * 100 : null;
}

export const PERIOD_LABEL: Record<Period, { es: string; en: string }> = {
  "1D": { es: "Día", en: "Day" }, "1W": { es: "Semana", en: "Week" }, "1M": { es: "Mes", en: "Month" },
  PREV: { es: "Período ant.", en: "Prev. period" }, YTD: { es: "En el año", en: "YTD" }, YOY: { es: "Interanual", en: "YoY" },
};

/** Inflación acumulada desde una fecha base, a partir de las tasas mensuales (%). */
export function cumulative(monthly: Point[], fromYm: string): Point[] {
  let idx = 1;
  const out: Point[] = [];
  for (const [d, v] of monthly) {
    if (d.slice(0, 7) < fromYm) continue;
    idx *= 1 + v / 100;
    out.push([d, (idx - 1) * 100]);
  }
  return out;
}

export const defaultPeriods = (freq: string | null): Period[] =>
  freq === "D" ? ["1D", "1W", "1M", "YTD"] : freq === "W" ? ["PREV", "1M", "YTD", "YOY"] : freq === "M" ? ["PREV", "YTD", "YOY"] : ["PREV", "YOY"];
