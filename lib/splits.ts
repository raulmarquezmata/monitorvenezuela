/** Ajuste de precios por cambios en el capital (splits y reverse splits).
 *  Un reverse split 100:1 multiplica el precio por 100 de un día para otro y deforma el gráfico: los precios
 *  anteriores al evento se multiplican por el mismo factor, para que toda la serie quede expresada en las
 *  acciones que existen hoy. Se detecta solo (salto de precio ≥ 4 veces que el mercado no explica) y se puede
 *  fijar o descartar a mano en config/bvc_ajustes.json. */
import ajustes from "@/config/bvc_ajustes.json";

type Point = [string, number];
export type SplitEvent = { date: string; factor: number; manual: boolean };
type Cfg = { ajustes?: Record<string, { fecha: string; factor: number; nota?: string }[]>; ignorar?: Record<string, string[]> };
const CFG = ajustes as Cfg;
const NICE = [2, 3, 4, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 1e4, 1e5, 1e6];

function at(pts: Point[], d: string): number | null {
  let lo = 0, hi = pts.length - 1, v: number | null = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= d) { v = pts[m][1]; lo = m + 1; } else hi = m - 1; }
  return v;
}

/** Eventos de capital de un símbolo: los fijados a mano y los detectados en la serie de precios. */
export function splitEvents(symbol: string, prices: Point[], ibc: Point[] = []): SplitEvent[] {
  const manual = (CFG.ajustes?.[symbol] ?? []).map((a) => ({ date: a.fecha, factor: a.factor, manual: true }));
  const ignore = new Set(CFG.ignorar?.[symbol] ?? []);
  const out: SplitEvent[] = [...manual];
  for (let i = 1; i < prices.length; i++) {
    const [d, p] = prices[i], [d0, p0] = prices[i - 1];
    if (!p || !p0 || ignore.has(d) || manual.some((m) => m.date === d)) continue;
    const i1 = at(ibc, d), i0 = at(ibc, d0);
    const rr = (p / p0) / (i1 && i0 ? i1 / i0 : 1);  // salto que no explica el mercado
    if (rr < 4 && rr > 0.25) continue;
    const big = rr >= 1 ? rr : 1 / rr;
    const nice = NICE.reduce((a, b) => (Math.abs(Math.log(b / big)) < Math.abs(Math.log(a / big)) ? b : a));
    const k = Math.abs(Math.log(nice / big)) < Math.log(1.25) ? nice : big;
    out.push({ date: d, factor: rr >= 1 ? k : 1 / k, manual: false });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Precios anteriores a cada evento × factor: toda la serie queda en el capital accionario actual. */
export function adjustPrices(prices: Point[], events: SplitEvent[]): Point[] {
  if (!events.length) return prices;
  return prices.map(([d, v]) => {
    let k = 1;
    for (const e of events) if (d < e.date) k *= e.factor;
    return [d, v * k] as Point;
  });
}

export function splitLabel(e: SplitEvent, lang: "es" | "en"): string {
  const f = e.factor >= 1 ? e.factor : 1 / e.factor;
  const n = new Intl.NumberFormat(lang === "es" ? "es-VE" : "en-US", { maximumFractionDigits: f < 10 ? 2 : 0 }).format(f);
  return e.factor >= 1
    ? (lang === "es" ? `reverse split ${n}:1` : `${n}-for-1 reverse split`)
    : (lang === "es" ? `split 1:${n}` : `1-for-${n} split`);
}
