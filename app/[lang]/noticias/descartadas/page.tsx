import { createClient } from "@supabase/supabase-js";
import NewsNav from "@/components/NewsNav";
import { dateTime } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

// auditoría del filtro de noticias: lo que el robot dejó fuera y por qué (se guarda 21 días)
export const dynamic = "force-dynamic";
const REPO = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/raulmarquezmata/monitorvenezuela";

type Reject = { url: string; title: string; source: string | null; published_at: string | null; reason: string; score: number | null; seen_at: string };

async function rejects(hours: number): Promise<Reject[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const { data } = await sb.from("news_rejects").select("url,title,source,published_at,reason,score,seen_at")
    .gte("seen_at", since).order("published_at", { ascending: false }).limit(600);
  return (data ?? []) as Reject[];
}

/** Motivo principal, sin el detalle de puntos («puntaje 1 < 3: …» → «puntaje bajo»). */
const motive = (r: string) => (r.startsWith("puntaje") ? "puntaje bajo" : r.split(";")[0]);

export default async function Descartadas({ params, searchParams }: { params: { lang: Lang }; searchParams: { m?: string; h?: string } }) {
  const { lang } = params;
  const es = lang === "es";
  const hours = Math.min(504, Math.max(6, Number(searchParams.h) || 48));
  const all = await rejects(hours);
  const counts = new Map<string, number>();
  for (const r of all) counts.set(motive(r.reason), (counts.get(motive(r.reason)) ?? 0) + 1);
  const sel = searchParams.m && counts.has(searchParams.m) ? searchParams.m : undefined;
  const list = sel ? all.filter((r) => motive(r.reason) === sel) : all;
  const q = (o: { m?: string; h?: number }) => {
    const p = new URLSearchParams();
    if (o.m) p.set("m", o.m);
    if ((o.h ?? hours) !== 48) p.set("h", String(o.h ?? hours));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <div>
      <NewsNav lang={lang} />
      <h1>{es ? "Noticias descartadas" : "Discarded headlines"}</h1>
      <p className="muted" style={{ maxWidth: 820 }}>
        {es
          ? "Titulares que el robot leyó y dejó fuera, con el motivo. Sirve para revisar el filtro: si algo bueno quedó fuera, se ajusta la fuente o la regla en "
          : "Headlines the robot read and left out, with the reason. Use it to review the filter: if something useful was dropped, adjust the source or rule in "}
        <a href={`${REPO}/edit/main/config/news_quality.json`} target="_blank" rel="noreferrer">config/news_quality.json</a>
        {es ? " o en " : " or "}<a href={`${REPO}/blob/main/ingest/news_filter.py`} target="_blank" rel="noreferrer">ingest/news_filter.py</a>.
      </p>
      <div className="ranges" role="group" style={{ margin: "12px 0" }}>
        {[24, 48, 168].map((h) => <a key={h} className={hours === h ? "on" : ""} href={q({ m: sel, h })}>{h === 168 ? (es ? "7 días" : "7 days") : `${h} h`}</a>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 16px" }}>
        <a className={`tag${sel ? "" : " on"}`} href={q({ h: hours })}>{es ? "Todos" : "All"} · {all.length}</a>
        {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
          <a key={m} className={`tag${sel === m ? " on" : ""}`} href={q({ m, h: hours })}>{m} · {n}</a>
        ))}
      </div>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th className="l">{es ? "Titular" : "Headline"}</th><th className="l">{es ? "Medio" : "Outlet"}</th><th>{es ? "Fecha" : "Date"}</th><th>{es ? "Puntos" : "Score"}</th><th className="l">{es ? "Motivo" : "Reason"}</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.url}>
                <td className="l" style={{ whiteSpace: "normal", minWidth: 280 }}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td>
                <td className="l">{r.source ?? "—"}</td>
                <td>{dateTime(r.published_at, lang)}</td>
                <td>{r.score ?? "—"}</td>
                <td className="l muted" style={{ whiteSpace: "normal", minWidth: 220, fontSize: 12 }}>{r.reason}</td>
              </tr>
            ))}
            {!list.length && <tr><td className="l muted" colSpan={5}>{es ? "Sin descartes en el período." : "Nothing discarded in this period."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
