/** Agrupa titulares que cuentan la misma noticia en distintos medios, para ofrecer varios enlaces. */
export type NewsItem = { id: number | string; title: string; url: string; source: string | null; published_at: string; summary?: string | null; category?: string | null; lang?: string | null };
export type NewsGroup<T extends NewsItem> = T & { also: { source: string; url: string }[] };

const STOP = new Set("para como esta este esto estos sobre entre desde hasta tras pero sino porque cuando donde quien segun durante contra hacia ante bajo cada otro otra otros otras sera seran fueron tiene tienen hace venezuela venezolano venezolana venezolanos with from that this have will after over into about their they been were what says said amid".split(" "));
const words = (t: string) => new Set(t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9$% ]/g, " ")
  .split(/\s+/).filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOP.has(w)));

export function groupNews<T extends NewsItem>(items: T[], hours = 48): NewsGroup<T>[] {
  const out: (NewsGroup<T> & { _w: Set<string>; _t: number })[] = [];
  for (const it of items) {
    const w = words(it.title), t = Date.parse(it.published_at);
    const g = out.find((g) => {
      if (Math.abs(g._t - t) > hours * 3600e3) return false;
      let inter = 0; for (const x of w) if (g._w.has(x)) inter++;
      return inter >= 3 && inter / Math.min(w.size, g._w.size) >= 0.5;
    });
    if (g) {
      if (it.source !== g.source && !g.also.some((a) => a.source === it.source)) g.also.push({ source: it.source ?? "—", url: it.url });
      for (const x of w) g._w.add(x);
    } else out.push({ ...it, also: [], _w: w, _t: t });
  }
  return out.map(({ _w, _t, ...g }) => g as unknown as NewsGroup<T>);
}
