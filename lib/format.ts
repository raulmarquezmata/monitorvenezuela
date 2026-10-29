import type { Lang } from "./i18n";

const loc = (lang: Lang) => (lang === "es" ? "es-VE" : "en-US");

export function num(v: number | null | undefined, lang: Lang, decimals = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(loc(lang), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

/** Números grandes compactos: 1,2 mil MM / 1.2B */
export function compact(v: number | null | undefined, lang: Lang): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(loc(lang), { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function pct(v: number | null | undefined, lang: Lang, decimals = 2, sign = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = num(v, lang, decimals);
  return `${sign && v > 0 ? "+" : ""}${s}%`;
}

export function date(d: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }): string {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return new Intl.DateTimeFormat(loc(lang), { timeZone: "America/Caracas", ...opts }).format(dt);
}

export function dateTime(d: string | null | undefined, lang: Lang): string {
  return date(d, lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function change(cur?: number | null, prev?: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur / prev - 1) * 100;
}

/** Para series en % (inflación, brecha) la variación relevante es en puntos, no en %. */
export const isPercentUnit = (unit?: string | null) => unit === "%";

/** Fecha según frecuencia: diaria '29 oct 2026', mensual 'sept 2026', anual '2026'. */
export function fmtDateFor(d: string, freq: string | null, lang: Lang) {
  const opts: Intl.DateTimeFormatOptions = freq === "M" || freq === "Q" ? { month: "short", year: "numeric" } : freq === "A" ? { year: "numeric" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
}

