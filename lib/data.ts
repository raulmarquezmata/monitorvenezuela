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
export type News = { id: number; url: string; title: string; source: string | null; published_at: string; summary: string | null; category: string | null; lang: string };

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

export async function news(limit = 60, category?: string): Promise<News[]> {
  if (!sb) return [];
  let q = sb.from("news").select("*").order("published_at", { ascending: false }).limit(limit);
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return (data as News[]) ?? [];
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
  const { data } = await sb.from("ingest_runs").select("finished_at").eq("status", "ok").order("finished_at", { ascending: false }).limit(1);
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
  const { data: last } = await sb.from("bank_ranking").select("period").order("period", { ascending: false }).limit(1);
  if (!last?.length) return [];
  const { data } = await sb.from("bank_ranking").select("*").eq("period", last[0].period).order("value", { ascending: false });
  return (data as BankRow[]) ?? [];
}
