/** Agrupa titulares que cuentan la misma noticia en distintos medios, para ofrecer varios enlaces. */
export type NewsItem = { id: number | string; title: string; url: string; source: string | null; published_at: string; summary?: string | null; category?: string | null; lang?: string | null };
export type NewsGroup<T extends NewsItem> = T & { also: { source: string; url: string }[] };

const STOP = new Set("para como esta este esto estos sobre entre desde hasta tras pero sino porque cuando donde quien segun durante contra hacia ante bajo cada otro otra otros otras sera seran fueron tiene tienen hace venezuela venezolano venezolana venezolanos with from that this have will after over into about their they been were what says said amid".split(" "));
// misma historia con distinto titular: «EE.UU.», «Estados Unidos» y «Washington» cuentan igual; «12.000» = «12000»
const SYN: [RegExp, string][] = [[/\bee\.?\s?uu\.?|estados unidos|washington|u\.s\.|united states/g, " eeuu "], [/\bpdvsa\b|petroleos de venezuela/g, " pdvsa "],
  [/\bmil millones\b|\bbillones?\b|\bbillion\b/g, " millardos "], [/petrolera?s?|petroleo|crudo|\boil\b/g, " petroleo "]];
const norm = (t: string) => SYN.reduce((a, [r, x]) => a.replace(r, x), t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
  .replace(/\bus\$|\$/g, " ").replace(/(\d)[.,](\d{3})\b/g, "$1$2").replace(/(\d)[.,](\d{3})\b/g, "$1$2");
const words = (t: string) => new Set(norm(t).replace(/[^a-z0-9$% ]/g, " ")
  .split(/\s+/).filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOP.has(w)));
/** Cifras que identifican una historia (≥ 3 dígitos o porcentajes), redondeadas a 2 cifras: «12.000», «12.264» y «12.260» cuentan igual. */
const figures = (w: Set<string>) => [...w].filter((x) => /^\d{3,}$/.test(x) || /^\d+%$/.test(x)).map((x) => (/^\d{4,}$/.test(x) ? `${x.slice(0, 2)}e${x.length}` : x));

export function groupNews<T extends NewsItem>(items: T[], hours = 48): NewsGroup<T>[] {
  const out: (NewsGroup<T> & { _w: Set<string>; _t: number })[] = [];
  for (const it of items) {
    const w = words(it.title), t = Date.parse(it.published_at);
    const g = out.find((g) => {
      if (Math.abs(g._t - t) > hours * 3600e3) return false;
      let inter = 0; for (const x of w) if (g._w.has(x)) inter++;
      if (inter >= 3 && (inter >= 5 || inter / Math.min(w.size, g._w.size) >= 0.45)) return true;
      // misma cifra relevante + al menos 2 palabras en común = misma noticia contada distinto
      const gf = figures(g._w);
      return inter >= 2 && figures(w).some((f) => gf.includes(f));
    });
    if (g) {
      if (it.source !== g.source && !g.also.some((a) => a.source === it.source)) g.also.push({ source: it.source ?? "—", url: it.url });
      for (const x of w) g._w.add(x);
    } else out.push({ ...it, also: [], _w: w, _t: t });
  }
  return out.map(({ _w, _t, ...g }) => g as unknown as NewsGroup<T>);
}

/** Medios venezolanos (el resto cuenta como prensa internacional). */
export const VE_SOURCES = ["Banca y Negocios", "Finanzas Digital", "Tal Cual", "El Estímulo", "Ecosistema", "Bitácora Económica", "Venevisión",
  "Efecto Cocuyo", "El Nacional", "Noticias Venevision", "El Universal", "Últimas Noticias", "Globovisión", "Descifrado", "Petroguía", "El Pitazo", "Runrunes"];
export const isVenezuelan = (src?: string | null) => !!src && VE_SOURCES.some((v) => src.toLowerCase().includes(v.toLowerCase()));

/** Reparte la portada entre medios: como máximo `perSource` noticias de un mismo medio por cada tramo,
 *  para que un medio que publica mucho no tape a los demás. Mantiene el orden por fecha dentro de lo elegido. */
export function balanced<T extends { source: string | null; published_at: string }>(items: T[], perSource: number, total: number): T[] {
  const count = new Map<string, number>();
  const first: T[] = [], rest: T[] = [];
  for (const it of items) {
    const k = it.source ?? "—";
    const n = count.get(k) ?? 0;
    if (n < perSource) { first.push(it); count.set(k, n + 1); } else rest.push(it);
  }
  return [...first, ...rest].slice(0, total).sort((a, b) => b.published_at.localeCompare(a.published_at));
}
