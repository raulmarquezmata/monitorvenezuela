import Link from "next/link";
import { date } from "@/lib/format";
import NewsNav from "@/components/NewsNav";
import { t, type Lang } from "@/lib/i18n";
import { listPosts } from "@/lib/research";

export const dynamic = "force-static";

export default function ResearchIndex({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const d = t(lang);
  const posts = listPosts(lang);
  return (
    <>
      <NewsNav lang={lang} />
      <h1>{d.research}</h1>
      <p className="sub">{d.researchSub}</p>
      <div className="grid">
        {posts.map((p) => (
          <article className="card" key={p.slug}>
            <div className="m muted" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>{date(p.date, lang)}</span>{p.type && <span className="tag">{p.type}</span>}<span>{p.author}</span>
            </div>
            <h2 style={{ margin: "6px 0" }}><Link href={`/${lang}/research/${p.slug}`} style={{ textDecoration: "none" }}>{p.title}</Link></h2>
            {p.summary && <p style={{ margin: 0, color: "var(--text-2)" }}>{p.summary}</p>}
            <p style={{ marginBottom: 0 }}>
              <Link href={`/${lang}/research/${p.slug}`} className="btn">{d.readMore} →</Link>{" "}
              {p.pdf && <a href={p.pdf} className="btn" target="_blank" rel="noreferrer">⬇ {d.pdf}</a>}
            </p>
          </article>
        ))}
        {!posts.length && <div className="empty">{d.noData}</div>}
      </div>
    </>
  );
}
