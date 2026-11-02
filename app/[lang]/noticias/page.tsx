import Link from "next/link";
import NewsNav from "@/components/NewsNav";
import { NotConfigured } from "@/components/ui";
import { configured, news, ofacActions } from "@/lib/data";
import { date, dateTime } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { balanced, groupNews, isVenezuelan } from "@/lib/newsgroup";

// los filtros llegan por la URL (?cat=, ?m=…): se renderiza en cada visita
export const dynamic = "force-dynamic";

const CATS = ["economia", "politica", "petroleo", "mercados", "banca", "deuda", "mineria", "agro"];

export default async function Noticias({ params, searchParams }: { params: { lang: Lang }; searchParams: { cat?: string; o?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const cat = searchParams.cat && CATS.includes(searchParams.cat) ? searchParams.cat : undefined;
  const origin = searchParams.o === "int" ? "int" : searchParams.o === "ve" ? "ve" : undefined;
  const [raw, ofac] = await Promise.all([news(600, cat), ofacActions(12)]);
  const grouped = groupNews(raw).filter((n) => !origin || (origin === "ve") === isVenezuelan(n.source));
  const items = balanced(grouped, origin ? 15 : 10, 150);
  const q = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); const v = { cat, o: origin, ...o }; for (const [k, x] of Object.entries(v)) if (x) p.set(k, x); const s = p.toString(); return `/${lang}/noticias${s ? `?${s}` : ""}`; };
  return (
    <>
      <NewsNav lang={lang} />
      <h1>{d.nav.news}</h1>
      <p className="sub">{lang === "es" ? "Titulares de medios venezolanos e internacionales, clasificados automáticamente por tema." : "Headlines from Venezuelan and international media, auto-tagged by topic."}</p>
      <div className="chips">
        <Link href={q({ cat: undefined })} className={!cat ? "on" : ""}>{d.all}</Link>
        {CATS.map((c) => <Link key={c} href={q({ cat: c })} className={cat === c ? "on" : ""}>{d.cats[c]}</Link>)}
      </div>
      <div className="chips">
        <Link href={q({ o: undefined })} className={!origin ? "on" : ""}>{lang === "es" ? "Todos los medios" : "All outlets"}</Link>
        <Link href={q({ o: "ve" })} className={origin === "ve" ? "on" : ""}>{lang === "es" ? "Venezolanos" : "Venezuelan"}</Link>
        <Link href={q({ o: "int" })} className={origin === "int" ? "on" : ""}>{lang === "es" ? "Internacionales" : "International"}</Link>
      </div>
      <div className="grid two">
      <div className="card" style={{ paddingTop: 8 }}>
        <ul className="headlines" style={{ borderTop: 0 }}>
          {items.map((n) => (
            <li key={n.id}>
              <div className="m">
                {n.category && <span className="tag">{d.cats[n.category] ?? n.category}</span>}
                <span>{n.source} · {dateTime(n.published_at, lang)}</span>
                {n.lang && n.lang !== "es" && <span className="tag">{n.lang.toUpperCase()}</span>}
              </div>
              <a className="t" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
              {n.summary && <p>{n.summary}</p>}
              {n.also.length > 0 && (
                <p className="also">{lang === "es" ? "También en: " : "Also in: "}
                  {n.also.slice(0, 6).map((a, i) => <span key={a.url}>{i > 0 && " · "}<a href={a.url} target="_blank" rel="noreferrer">{a.source}</a></span>)}
                </p>
              )}
            </li>
          ))}
          {!items.length && <li className="muted">{d.noData}</li>}
        </ul>
      </div>
      <aside>
        <div className="card">
          <h3>{d.ofac}</h3>
          <ul className="news">
            {ofac.map((o) => (
              <li key={o.url}><a href={o.url} target="_blank" rel="noreferrer">{o.title}</a><div className="m">{date(o.date, lang)}</div></li>
            ))}
            {!ofac.length && <li className="muted">{d.noData}</li>}
          </ul>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          <Link href={`/${lang}/datos`}>{lang === "es" ? "Ver fuentes de noticias y su estado →" : "See news sources and their status →"}</Link>
        </p>
      </aside>
      </div>
    </>
  );
}
