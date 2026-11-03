import raw from "@/content/hemeroteca/noticias.json";
import type { Lang } from "./i18n";

type Raw = { cat: string; date: string; es: { title: string; preview?: string; body?: string }; en?: { title?: string; preview?: string; body?: string };
  sectors?: (string | { label: string })[]; sources?: { text: string; url: string }[] };

export type Nota = { i: number; cat: string; dateLabel: string; ym: string; day: number; titleEs: string; titleEn?: string;
  preview?: string; body?: string; sectors: string[]; sources: { text: string; url: string }[]; auto?: boolean };

const MON: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };

function parseDate(s: string): { ym: string; day: number } {
  const t = s.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const y = (t.match(/20\d\d/) ?? ["2026"])[0];
  const mons = t.match(/\b(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\b/g) ?? [];
  const m = mons.length ? MON[mons[mons.length - 1]] : 0;
  const day = Number((t.match(/^(\d{1,2})\s/) ?? [, "0"])[1]);
  return { ym: m ? `${y}-${String(m).padStart(2, "0")}` : `${y}-00`, day };
}

export const CATS = ["oil", "mac", "fin", "pol", "jur", "inv", "mkt", "min"] as const;
export const CAT_LABEL: Record<string, { es: string; en: string }> = {
  oil: { es: "Petróleo y gas", en: "Oil & gas" }, mac: { es: "Macroeconomía", en: "Macro" }, fin: { es: "Finanzas y banca", en: "Finance & banking" },
  pol: { es: "Política", en: "Politics" }, jur: { es: "Jurídico y sanciones", en: "Legal & sanctions" }, inv: { es: "Inversión", en: "Investment" },
  mkt: { es: "Mercados", en: "Markets" }, min: { es: "Minería", en: "Mining" },
};

export const NOTAS: Nota[] = (raw as Raw[]).map((r, i) => {
  const { ym, day } = parseDate(r.date);
  return { i, cat: r.cat, dateLabel: r.date, ym, day, titleEs: r.es.title, titleEn: r.en?.title, preview: r.es.preview, body: r.es.body,
    sectors: (r.sectors ?? []).map((x) => (typeof x === "string" ? x : x.label)), sources: r.sources ?? [] };
}).sort((a, b) => (a.ym === b.ym ? b.day - a.day || a.i - b.i : a.ym < b.ym ? 1 : -1));

export const MONTHS = Array.from(new Set(NOTAS.map((n) => n.ym)));

const SORT = (a: Nota, b: Nota) => (a.ym === b.ym ? b.day - a.day || a.i - b.i : a.ym < b.ym ? 1 : -1);
const MON_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const keyT = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);

/** Noticias recientes de medios económicos venezolanos que entran solas a la hemeroteca (además de las curadas). */
export type AutoNews = { url: string; title: string; title_es?: string | null; title_en?: string | null; source: string | null; published_at: string; summary: string | null; category: string | null };
export function withAuto(auto: AutoNews[]): Nota[] {
  const urls = new Set(NOTAS.flatMap((n) => n.sources.map((s) => s.url)));
  const titles = new Set(NOTAS.map((n) => keyT(n.titleEs)));
  const CAT: Record<string, string> = { petroleo: "oil", economia: "mac", cambiario: "mac", precios: "mac", banca: "fin", deuda: "fin", mercados: "mkt", mineria: "min", politica: "pol", sanciones: "jur", agro: "inv" };
  const INV = /adquiri|adquisici|invertir|inversi[oó]n|expansi|nueva ruta|aerol[ií]nea|vuelos|planta|f[aá]brica|franquicia|abre (su|una|un)|inaugur|alianza|acuerdo comercial/i;
  const seen = new Set<string>();
  const out: Nota[] = [];
  auto.forEach((a, k) => {
    const t = a.title_es || a.title;
    const kt = keyT(t);
    if (urls.has(a.url) || titles.has(kt) || seen.has(kt)) return;
    seen.add(kt);
    const d = new Date(Date.parse(a.published_at) - 4 * 3600e3);  // fecha en Caracas
    const ym = d.toISOString().slice(0, 7), day = d.getUTCDate();
    let cat = CAT[a.category ?? ""] ?? "mac";
    if (INV.test(t) && cat !== "oil" && cat !== "pol") cat = "inv";
    out.push({ i: 100000 + k, cat, dateLabel: `${day} ${MON_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`, ym, day, titleEs: t, titleEn: a.title_en ?? undefined,
      preview: a.summary ?? undefined, sectors: [], sources: [{ text: a.source ?? "—", url: a.url }], auto: true });
  });
  return [...NOTAS, ...out].sort(SORT);
}

export function monthLabel(ym: string, lang: Lang) {
  if (ym.endsWith("-00")) return lang === "es" ? `${ym.slice(0, 4)} (sin mes)` : `${ym.slice(0, 4)} (no month)`;
  return new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterNotas(f: { cat?: string; ym?: string; q?: string; sector?: string }, list: Nota[] = NOTAS) {
  const q = f.q ? norm(f.q) : "";
  return list.filter((n) => (!f.cat || n.cat === f.cat) && (!f.ym || n.ym === f.ym) && (!f.sector || n.sectors.includes(f.sector))
    && (!q || norm(`${n.titleEs} ${n.titleEn ?? ""} ${n.preview ?? ""} ${n.body ?? ""} ${n.sectors.join(" ")}`).includes(q)));
}

export function topSectors(n = 18) {
  const c = new Map<string, number>();
  for (const x of NOTAS) for (const s of x.sectors) c.set(s, (c.get(s) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s);
}
