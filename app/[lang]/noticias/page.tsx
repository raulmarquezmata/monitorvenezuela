import Link from "next/link";
import NewsNav from "@/components/NewsNav";
import { NotConfigured } from "@/components/ui";
import { configured, news, ofacActions } from "@/lib/data";
import { date, dateTime } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";

export const revalidate = 300;
const CATS = ["economia", "cambiario", "petroleo", "mercados", "banca", "sanciones", "agro"];

export default async function Noticias({ params, searchParams }: { params: { lang: Lang }; searchParams: { cat?: string } }) {
  const { lang } = params;
  const d = t(lang);
  if (!configured) return <NotConfigured />;
  const cat = searchParams.cat && CATS.includes(searchParams.cat) ? searchParams.cat : undefined;
  const [items, ofac] = await Promise.all([news(120, cat), ofacActions(12)]);
  return (
    <>
      <NewsNav lang={lang} />
      <h1>{d.nav.news}</h1>
      <p className="sub">{lang === "es" ? "Titulares de medios venezolanos e internacionales, clasificados automáticamente por tema." : "Headlines from Venezuelan and international media, auto-tagged by topic."}</p>
      <div className="chips">
        <Link href={`/${lang}/noticias`} className={!cat ? "on" : ""}>{d.all}</Link>
        {CATS.map((c) => <Link key={c} href={`/${lang}/noticias?cat=${c}`} className={cat === c ? "on" : ""}>{d.cats[c]}</Link>)}
      </div>
      <div className="grid two">
      <div className="card" style={{ paddingTop: 8 }}>
        <ul className="headlines" style={{ borderTop: 0 }}>
          {items.map((n) => (
            <li key={n.id}>
              <div className="m">
                {n.category && <span className="tag">{d.cats[n.category] ?? n.category}</span>}
                <span>{n.source} · {dateTime(n.published_at, lang)}</span>
                {n.lang === "en" && <span className="tag">EN</span>}
              </div>
              <a className="t" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
              {n.summary && <p>{n.summary}</p>}
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
