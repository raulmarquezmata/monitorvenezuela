import Link from "next/link";
import { informes } from "@/lib/data";
import { date } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { listPosts } from "@/lib/research";

// los filtros llegan por la URL (?tema=, ?idioma=, ?q=): se renderiza en cada visita
export const dynamic = "force-dynamic";

const TOPICS: Record<string, { es: string; en: string }> = {
  petroleo: { es: "Petróleo y gas", en: "Oil & gas" },
  electricidad: { es: "Electricidad", en: "Electricity" },
  mineria: { es: "Minería", en: "Mining" },
  politica: { es: "Política", en: "Politics" },
  economia: { es: "Economía", en: "Economy" },
  finanzas: { es: "Banca y mercados", en: "Banking & markets" },
  agro: { es: "Agro", en: "Agriculture" },
  comentario: { es: "Comentarios", en: "Commentary" },
};

type Item = { key: string; title: string; date: string | null; topic: string; lang: string; summary: string | null;
  href: string; pdf: string | null; thumb: string | null; pages: number | null; internal: boolean };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function Informes({ params, searchParams }: { params: { lang: Lang }; searchParams: { tema?: string; idioma?: string; q?: string } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  const pdfs = await informes();
  const posts = listPosts(lang);
  const all: Item[] = [
    ...pdfs.map((x) => ({ key: x.id, title: x.title, date: x.date, topic: x.topic || "economia", lang: x.lang || "es", summary: x.summary,
      href: x.url, pdf: x.url, thumb: x.thumb_url, pages: x.pages, internal: false })),
    ...posts.map((p) => ({ key: p.slug, title: p.title, date: p.date, topic: "comentario", lang: lang === "en" && !p.translated ? "es" : lang,
      summary: p.summary, href: `/${lang}/research/${p.slug}`, pdf: p.pdf, thumb: null, pages: null, internal: true })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const tema = searchParams.tema && TOPICS[searchParams.tema] ? searchParams.tema : undefined;
  const idioma = searchParams.idioma === "es" || searchParams.idioma === "en" ? searchParams.idioma : undefined;
  const q = (searchParams.q ?? "").trim();
  const items = all.filter((x) => (!tema || x.topic === tema) && (!idioma || x.lang === idioma)
    && (!q || norm(`${x.title} ${x.summary ?? ""}`).includes(norm(q))));
  const present = Object.keys(TOPICS).filter((k) => all.some((x) => x.topic === k));
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tema, idioma, q: q || undefined, ...o })) if (v) p.set(k, v);
    const s = p.toString();
    return `/${lang}/informes${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <div className="head-row">
        <div>
          <h1>{d.research}</h1>
          <p className="sub">{d.researchSub} {all.length > 0 && (es ? `${all.length} publicaciones.` : `${all.length} publications.`)}</p>
        </div>
        <form action={`/${lang}/informes`} style={{ display: "flex", gap: 6 }}>
          {tema && <input type="hidden" name="tema" value={tema} />}
          {idioma && <input type="hidden" name="idioma" value={idioma} />}
          <input name="q" defaultValue={q} placeholder={es ? "Buscar informe…" : "Search reports…"} className="search" />
        </form>
      </div>
      <div className="chips">
        <Link href={href({ tema: undefined })} className={!tema ? "on" : ""}>{d.all}</Link>
        {present.map((k) => <Link key={k} href={href({ tema: k })} className={tema === k ? "on" : ""}>{TOPICS[k][lang]}</Link>)}
      </div>
      <div className="chips">
        <Link href={href({ idioma: undefined })} className={!idioma ? "on" : ""}>{es ? "Ambos idiomas" : "Both languages"}</Link>
        <Link href={href({ idioma: "es" })} className={idioma === "es" ? "on" : ""}>{es ? "En español" : "In Spanish"}</Link>
        <Link href={href({ idioma: "en" })} className={idioma === "en" ? "on" : ""}>{es ? "En inglés" : "In English"}</Link>
      </div>
      <div className="grid g3 informes">
        {items.map((x) => (
          <article className="card informe" key={x.key}>
            {x.thumb && (
              <a href={x.href} target={x.internal ? undefined : "_blank"} rel="noreferrer" className="portada">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.thumb} alt="" loading="lazy" />
              </a>
            )}
            <div className="m muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
              {x.date && <span>{date(x.date, lang)}</span>}
              <span className="tag">{TOPICS[x.topic]?.[lang] ?? x.topic}</span>
              <span className="tag">{x.lang.toUpperCase()}</span>
              {x.pages ? <span>{x.pages} {es ? (x.pages === 1 ? "pág." : "págs.") : x.pages === 1 ? "page" : "pages"}</span> : null}
            </div>
            <h3 style={{ margin: "8px 0 6px", lineHeight: 1.3 }}>
              {x.internal ? <Link href={x.href} style={{ textDecoration: "none" }}>{x.title}</Link>
                : <a href={x.href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{x.title}</a>}
            </h3>
            {x.summary && <p className="resumen">{x.summary}</p>}
            <p style={{ marginBottom: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {x.internal && <Link href={x.href} className="btn">{d.readMore} →</Link>}
              {x.pdf && <a href={x.pdf} className="btn" target="_blank" rel="noreferrer">{es ? "Abrir PDF" : "Open PDF"}</a>}
              {x.pdf && !x.internal && <a href={`${x.pdf}?download=`} className="btn">⬇ {es ? "Descargar" : "Download"}</a>}
            </p>
          </article>
        ))}
        {!items.length && <div className="empty">{q || tema || idioma ? (es ? "No hay informes con ese filtro." : "No reports match that filter.") : d.noData}</div>}
      </div>
    </>
  );
}
