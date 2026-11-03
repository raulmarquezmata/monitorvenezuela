import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
const sb = configured ? createClient(url!, key!, { auth: { persistSession: false } }) : null;

export type Latest = {
  code: string; category: string; name_es: string; name_en: string; unit_es: string | null; unit_en: string | null;
  frequency: string | null; source: string | null; source_url: string | null; decimals: number; sort: number;
  is_manual: boolean; method: "auto" | "calibrar" | "manual"; stale_days: number; howto_es: string | null; last_date: string | null; last_value: number | null; prev_date: string | null; prev_value: number | null;
  updated_at: string | null;
};
export type Point = [string, number];
export type Quote = {
  date: string; symbol: string; name: string | null; open: number | null; high: number | null; low: number | null;
  close: number | null; var_abs: number | null; var_pct: number | null; volume: number | null; amount: number | null;
  trades: number | null; market: string; company: string | null; shares_outstanding: number | null; sector: string | null; market_cap_bs: number | null;
};
export type News = { id: number; url: string; title: string; source: string | null; published_at: string; summary: string | null; category: string | null; lang: string;
  title_es?: string | null; title_en?: string | null; orig_lang?: string };

/** Titular en el idioma de la página (traducido por el robot); el resumen solo si ya está en ese idioma. */
export function localizeNews<T extends News>(n: T, lang: "es" | "en"): T {
  const t = lang === "en" ? n.title_en : n.title_es;
  const src = (n.lang || "es").slice(0, 2);
  return { ...n, orig_lang: src, title: t || n.title, summary: src === lang ? n.summary : null };
}

/** Lee todas las filas paginando (PostgREST devuelve máx. 1000 por consulta). */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  if (!sb) return [];
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) { console.error(error); break; }
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function latest(category?: string): Promise<Latest[]> {
  if (!sb) return [];
  let q = sb.from("latest_observations").select("*").order("sort");
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) console.error(error);
  return (data as Latest[]) ?? [];
}

export async function history(codes: string[], sinceYears = 12): Promise<Record<string, Point[]>> {
  const since = new Date(Date.now() - sinceYears * 365.25 * 864e5).toISOString().slice(0, 10);
  const rows = await all<{ series_code: string; date: string; value: number }>((a, b) =>
    sb!.from("observations").select("series_code,date,value").in("series_code", codes).gte("date", since)
      .order("series_code").order("date").range(a, b));
  const out: Record<string, Point[]> = Object.fromEntries(codes.map((c) => [c, []]));
  for (const r of rows) out[r.series_code]?.push([r.date, r.value]);
  return out;
}

export async function bvcLatest(market: "RV" | "RF" = "RV"): Promise<Quote[]> {
  if (!sb) return [];
  const { data } = await sb.from("bvc_latest").select("*").eq("market", market).order("amount", { ascending: false, nullsFirst: false });
  return (data as Quote[]) ?? [];
}

export async function bvcSymbol(symbol: string) {
  if (!sb) return { meta: null, quotes: [] as Quote[] };
  const [{ data: meta }, quotes] = await Promise.all([
    sb.from("bvc_symbols").select("*").eq("symbol", symbol).maybeSingle(),
    all<Quote>((a, b) => sb!.from("bvc_quotes").select("*").eq("symbol", symbol).order("date").range(a, b)),
  ]);
  return { meta, quotes };
}

export type BvcEvent = { id: string; symbol: string; date: string; kind: string | null; title: string | null; url: string | null; source: string | null };
/** Asambleas y eventos de un emisor (todas sus clases de acciones). */
export async function bvcEvents(symbols: string[]): Promise<BvcEvent[]> {
  if (!sb || !symbols.length) return [];
  const { data, error } = await sb.from("bvc_events").select("*").in("symbol", symbols).order("date", { ascending: false }).limit(20);
  return error ? [] : ((data as BvcEvent[]) ?? []);
}

/** Noticias etiquetadas con el símbolo (o con otra clase de la misma empresa). */
export async function symbolNews(symbols: string[], lang: "es" | "en", limit = 12): Promise<News[]> {
  if (!sb || !symbols.length) return [];
  const { data, error } = await sb.from("news").select("*").overlaps("symbols", symbols).order("published_at", { ascending: false }).limit(limit);
  return error ? [] : ((data as News[]) ?? []).map((n) => localizeNews(n, lang));
}

/** Clases de acciones de la misma empresa (p. ej. RST y RST.B) con su último cierre. */
export async function companyClasses(company: string | null | undefined, symbol: string): Promise<Quote[]> {
  if (!sb) return [];
  if (!company) {
    const { data } = await sb.from("bvc_latest").select("*").eq("symbol", symbol);
    return (data as Quote[]) ?? [];
  }
  const { data: syms } = await sb.from("bvc_symbols").select("symbol,shares_outstanding,company").eq("company", company).eq("market", "RV");
  const out: Quote[] = [];
  for (const s of (syms ?? []) as { symbol: string; shares_outstanding: number | null; company: string }[]) {
    const { data } = await sb.from("bvc_quotes").select("*").eq("symbol", s.symbol).gt("close", 0).order("date", { ascending: false }).limit(1);
    const q = (data?.[0] as Quote | undefined);
    if (q) out.push({ ...q, company: s.company, shares_outstanding: s.shares_outstanding, sector: null, market_cap_bs: s.shares_outstanding && q.close ? s.shares_outstanding * q.close : null });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export type Informe = { id: string; file: string; url: string; thumb_url: string | null; title: string; date: string | null; lang: string; topic: string; summary: string | null; pages: number | null; size: number | null; created_at: string };
export async function informes(): Promise<Informe[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("informes").select("id,file,url,thumb_url,title,date,lang,topic,summary,pages,size,created_at").order("date", { ascending: false, nullsFirst: false }).limit(1000);
  return error ? [] : ((data as Informe[]) ?? []);
}

/** URL pública del informe PDF de una acción (lo genera el robot «reportes» cada día). */
export function stockReportUrl(symbol: string, lang: "es" | "en", version?: string | null): string | null {
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/reportes/acciones/${encodeURIComponent(symbol)}_${lang}.pdf${version ? `?v=${version}` : ""}`;
}

export async function news(limit = 60, category?: string, lang?: "es" | "en"): Promise<News[]> {
  if (!sb) return [];
  let q = sb.from("news").select("*").order("published_at", { ascending: false }).limit(limit);
  // categorías unificadas: cambiario y precios → economía; sanciones → política
  const ALIAS: Record<string, string[]> = { economia: ["economia", "cambiario", "precios"], politica: ["politica", "sanciones"] };
  if (category) q = q.in("category", ALIAS[category] ?? [category]);
  const { data } = await q;
  const rows = (data as News[]) ?? [];
  return lang ? rows.map((n) => localizeNews(n, lang)) : rows;
}

export type Trade = { year: number; flow: string; partner_code: number; partner: string; hs2: string; hs2_desc: string | null; value_usd: number };
export async function trade(): Promise<Trade[]> {
  return all<Trade>((a, b) => sb!.from("trade_flows").select("year,flow,partner_code,partner,hs2,hs2_desc,value_usd").order("year").range(a, b));
}

export type Agro = { year: number; item_code: number; item: string; element: string; value: number; unit: string };
export async function agro(): Promise<Agro[]> {
  return all<Agro>((a, b) => sb!.from("agro_production").select("*").order("year").range(a, b));
}

export async function status() {
  if (!sb) return { runs: [], files: [] };
  const [{ data: runs }, { data: files }] = await Promise.all([
    sb.from("ingest_status").select("*").order("job"),
    sb.from("source_files").select("*").order("first_seen", { ascending: false }).limit(25),
  ]);
  return { runs: runs ?? [], files: files ?? [] };
}

export async function lastRun(): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.from("ingest_runs").select("finished_at").in("status", ["ok", "partial"]).order("finished_at", { ascending: false }).limit(1);
  return data?.[0]?.finished_at ?? null;
}

export type FeedStatus = { name: string; url: string; lang: string; last_run: string | null; last_ok: string | null; last_items: number | null; last_error: string | null };
export async function newsSources(): Promise<FeedStatus[]> {
  if (!sb) return [];
  const { data } = await sb.from("news_sources").select("*").order("name");
  return (data as FeedStatus[]) ?? [];
}

export type OfacAction = { url: string; date: string; title: string };
export async function ofacActions(limit = 10): Promise<OfacAction[]> {
  if (!sb) return [];
  const { data } = await sb.from("ofac_actions").select("url,date,title").order("date", { ascending: false }).limit(limit);
  return (data as OfacAction[]) ?? [];
}

/** Estado de frescura de una serie según su periodicidad esperada. */
export function freshness(s: Latest): "fresh" | "stale" | "empty" {
  if (!s.last_date) return "empty";
  const days = (Date.now() - Date.parse(`${s.last_date}T12:00:00Z`)) / 864e5;
  return days > (s.stale_days ?? 30) ? "stale" : "fresh";
}

export type Event = { id: string; date: string; precision: string; category: string | null; importance: number;
  title_es: string; title_en: string | null; body_es: string | null; series_code: string | null; url: string | null; origin: string };
export async function events(limit = 400, year?: number): Promise<Event[]> {
  if (!sb) return [];
  let q = sb.from("events").select("*").order("date", { ascending: false }).order("importance").limit(limit);
  if (year) q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  const { data } = await q;
  return (data as Event[]) ?? [];
}

export type Bond = { ticker: string; issuer: string; coupon: number | null; maturity: string | null; name: string; sort: number };
export async function bonds(): Promise<{ list: Bond[]; prices: Record<string, Point[]> }> {
  if (!sb) return { list: [], prices: {} };
  const [{ data: list }, rows] = await Promise.all([
    sb.from("bonds").select("*").order("issuer", { ascending: false }).order("maturity"),
    all<{ ticker: string; date: string; price: number }>((a, b) => sb!.from("bond_prices").select("ticker,date,price").order("date").range(a, b)),
  ]);
  const prices: Record<string, Point[]> = {};
  for (const r of rows) (prices[r.ticker] ??= []).push([r.date, r.price]);
  return { list: (list as Bond[]) ?? [], prices };
}

export type BankRow = { period: string; bank: string; metric: string; value: number; share: number | null };
export async function bankRanking(): Promise<BankRow[]> {
  if (!sb) return [];
  const { data: last } = await sb.from("bank_ranking").select("period").in("metric", ["creditos", "captaciones"]).order("period", { ascending: false }).limit(1);
  if (!last?.length) return [];
  const { data } = await sb.from("bank_ranking").select("*").eq("period", last[0].period).in("metric", ["creditos", "captaciones"]).order("value", { ascending: false });
  return (data as BankRow[]) ?? [];
}

/** Todo el sistema (tablas de Finanzas Digital/SUDEBAN): todas las métricas que no son de la muestra, todos los meses. */
export async function bankSystem(): Promise<BankRow[]> {
  if (!sb) return [];
  return all<BankRow>((a, b) => sb!.from("bank_ranking").select("period,bank,metric,value,share").not("metric", "like", "muestra_%").order("period").range(a, b));
}

/** Muestra de bancos (archivo data/bancos/Bancos.xlsx): todas las métricas, todos los meses. */
export async function bankSample(): Promise<BankRow[]> {
  if (!sb) return [];
  return all<BankRow>((a, b) => sb!.from("bank_ranking").select("period,bank,metric,value,share").like("metric", "muestra_%").order("period").range(a, b));
}
