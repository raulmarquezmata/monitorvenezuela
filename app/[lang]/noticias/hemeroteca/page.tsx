import Link from "next/link";
import NewsNav from "@/components/NewsNav";
import { CAT_LABEL, CATS, filterNotas, MONTHS, monthLabel, NOTAS, topSectors } from "@/lib/hemeroteca";
import type { Lang } from "@/lib/i18n";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";

const PER = 40;

export default function Hemeroteca({ params, searchParams }: { params: { lang: Lang }; searchParams: { cat?: string; m?: string; q?: string; s?: string; p?: string } }) {
  const { lang } = params;
  const es = lang === "es";
  const cat = CATS.includes(searchParams.cat as never) ? searchParams.cat : undefined;
  const ym = searchParams.m && MONTHS.includes(searchParams.m) ? searchParams.m : undefined;
  const q = (searchParams.q ?? "").slice(0, 80).trim() || undefined;
  const sector = searchParams.s || undefined;
  const all = filterNotas({ cat, ym, q, sector });
  const pages = Math.max(1, Math.ceil(all.length / PER));
  const page = Math.min(pages, Math.max(1, Number(searchParams.p) || 1));
  const list = all.slice((page - 1) * PER, page * PER);
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { cat, m: ym, q, s: sector, ...o };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    const qs = p.toString();
    return `/${lang}/noticias/hemeroteca${qs ? `?${qs}` : ""}`;
  };
  // agrupar la página por mes
  const groups: [string, typeof list][] = [];
  for (const n of list) { const g = groups[groups.length - 1]; if (g && g[0] === n.ym) g[1].push(n); else groups.push([n.ym, [n]]); }

  return (
    <>
      <NewsNav lang={lang} />
      <h1>{es ? "Hemeroteca 2026" : "2026 news archive"}</h1>
      <p className="sub">{es
        ? `${NOTAS.length} noticias seleccionadas y resumidas, con sus fuentes. Filtra por tema, mes o palabra.`
        : `${NOTAS.length} curated, summarized stories with their sources (summaries in Spanish). Filter by topic, month or keyword.`}</p>

      <form className="hm-search" action={`/${lang}/noticias/hemeroteca`}>
        {cat && <input type="hidden" name="cat" value={cat} />}
        {ym && <input type="hidden" name="m" value={ym} />}
        <input type="search" name="q" defaultValue={q} placeholder={es ? "Buscar: Chevron, encaje, GL 52, Citgo…" : "Search: Chevron, reserve requirement, GL 52…"} />
        <button type="submit">{es ? "Buscar" : "Search"}</button>
      </form>

      <div className="chips">
        <Link href={href({ cat: undefined, p: undefined })} className={!cat ? "on" : ""}>{es ? "Todos los temas" : "All topics"}</Link>
        {CATS.map((c) => <Link key={c} href={href({ cat: c, p: undefined })} className={cat === c ? "on" : ""}>{CAT_LABEL[c][lang]}</Link>)}
      </div>
      <div className="chips">
        <Link href={href({ m: undefined, p: undefined })} className={!ym ? "on" : ""}>{es ? "Todo el año" : "Whole year"}</Link>
        {MONTHS.map((m) => <Link key={m} href={href({ m, p: undefined })} className={ym === m ? "on" : ""}>{monthLabel(m, lang)}</Link>)}
      </div>
      <details className="hm-sectors">
        <summary>{sector ? `${es ? "Sector" : "Sector"}: ${sector}` : es ? "Filtrar por sector" : "Filter by sector"}</summary>
        <div className="chips" style={{ marginTop: 10 }}>
          <Link href={href({ s: undefined, p: undefined })} className={!sector ? "on" : ""}>{es ? "Todos" : "All"}</Link>
          {topSectors(24).map((s) => <Link key={s} href={href({ s, p: undefined })} className={sector === s ? "on" : ""}>{s}</Link>)}
        </div>
      </details>

      <p className="muted">{all.length} {es ? "noticias" : "stories"}{q ? ` · «${q}»` : ""}</p>

      {groups.map(([m, items]) => (
        <section key={m}>
          <div className="tl-month">{monthLabel(m, lang)}</div>
          <ul className="headlines">
            {items.map((n) => (
              <li key={n.i}>
                <div className="m">
                  <span className="tag">{CAT_LABEL[n.cat]?.[lang] ?? n.cat}</span>
                  <span>{n.dateLabel}</span>
                  {n.sectors.slice(0, 3).map((s) => <Link key={s} href={href({ s, p: undefined })} className="hm-sector">{s}</Link>)}
                </div>
                <details className="hm-item">
                  <summary className="t">{es ? n.titleEs : n.titleEn || n.titleEs}</summary>
                  {!es && n.titleEn && <p className="muted" style={{ fontStyle: "italic" }}>{n.titleEs}</p>}
                  {n.preview && <p><b>{n.preview}</b></p>}
                  {n.body && <p>{n.body}</p>}
                  {n.sources.length > 0 && (
                    <p className="hm-src">{es ? "Fuentes: " : "Sources: "}
                      {n.sources.map((s, k) => <span key={k}>{k > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">{s.text}</a></span>)}
                    </p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!all.length && <div className="empty">{es ? "Sin resultados." : "No results."}</div>}

      {pages > 1 && (
        <nav className="hm-pager">
          {page > 1 && <Link href={href({ p: String(page - 1) })}>← {es ? "Anteriores" : "Newer"}</Link>}
          <span>{page} / {pages}</span>
          {page < pages && <Link href={href({ p: String(page + 1) })}>{es ? "Siguientes" : "Older"} →</Link>}
        </nav>
      )}
    </>
  );
}
