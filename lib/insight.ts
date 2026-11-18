/** Frase de lectura automática para un gráfico: cuánto cambió en el último período y si está en un máximo o mínimo. */
import type { Point } from "./stats";
import { change, valueAt } from "./stats";

const fmtN = (v: number, lang: "es" | "en", d = 1) => new Intl.NumberFormat(lang === "es" ? "es-VE" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export function insight(pts: Point[], freq: string | null, pctUnit: boolean, lang: "es" | "en"): string | null {
  const es = lang === "es";
  const last = pts.at(-1);
  if (!last || pts.length < 6) return null;
  const daily = freq === "D" || freq === "W";
  const per = daily ? "1M" : "PREV";
  const ch = change(pts, per, pctUnit);
  const fmtD = (d: string) => new Intl.DateTimeFormat(es ? "es-VE" : "en-US", daily ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${d}T12:00:00Z`)).replace(/\./g, "");
  const parts: string[] = [];
  if (ch != null && Math.abs(ch) >= (pctUnit ? 0.05 : 0.05)) {
    const amt = pctUnit ? `${fmtN(Math.abs(ch), lang)} ${es ? "pp" : "pp"}` : `${fmtN(Math.abs(ch), lang)}%`;
    const when = daily ? (es ? "en el último mes" : "over the past month") : (es ? "frente al período anterior" : "versus the previous period");
    parts.push(es ? `${ch > 0 ? "Subió" : "Bajó"} ${amt} ${when}` : `${ch > 0 ? "Up" : "Down"} ${amt} ${when}`);
  } else if (ch != null) {
    parts.push(es ? (daily ? "Casi sin cambios en el último mes" : "Casi sin cambios frente al período anterior") : (daily ? "Little changed over the past month" : "Little changed versus the previous period"));
  }
  // ¿máximo o mínimo de cuánto tiempo? (solo si supera al menos un año de historia)
  const prev = pts.slice(0, -1);
  const lastHigher = [...prev].reverse().find((p) => p[1] >= last[1]);
  const lastLower = [...prev].reverse().find((p) => p[1] <= last[1]);
  const yearAgo = valueAt(pts, `${Number(last[0].slice(0, 4)) - 1}${last[0].slice(4)}`);
  const longEnough = (d?: string) => !!yearAgo && (!d || d <= yearAgo[0]);
  if (!lastHigher && longEnough()) parts.push(es ? "es el nivel más alto de toda la serie" : "the highest on record");
  else if (lastHigher && longEnough(lastHigher[0])) parts.push(es ? `es su nivel más alto desde ${fmtD(lastHigher[0])}` : `its highest since ${fmtD(lastHigher[0])}`);
  else if (!lastLower && longEnough()) parts.push(es ? "es el nivel más bajo de toda la serie" : "the lowest on record");
  else if (lastLower && longEnough(lastLower[0])) parts.push(es ? `es su nivel más bajo desde ${fmtD(lastLower[0])}` : `its lowest since ${fmtD(lastLower[0])}`);
  if (!parts.length) return null;
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
