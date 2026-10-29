import Link from "next/link";
import { notFound } from "next/navigation";
import { date } from "@/lib/format";
import NewsNav from "@/components/NewsNav";
import { LANGS, t, type Lang } from "@/lib/i18n";
import { getPost, listPosts } from "@/lib/research";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => listPosts(lang).map((p) => ({ lang, slug: p.slug })));
}

export default function PostPage({ params }: { params: { lang: Lang; slug: string } }) {
  const { lang } = params;
  const d = t(lang);
  const p = getPost(params.slug, lang);
  if (!p) notFound();
  return (
    <article style={{ maxWidth: 760 }}>
      <NewsNav lang={lang} />
      <p className="muted"><Link href={`/${lang}/research`}>← {d.research}</Link></p>
      <div className="muted" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>{date(p.date, lang)}</span>{p.type && <span className="tag">{p.type}</span>}<span>{p.author}</span>
        {lang === "en" && !p.translated && <span className="tag">ES</span>}
      </div>
      <h1 style={{ marginTop: 8 }}>{p.title}</h1>
      {p.summary && <p className="sub">{p.summary}</p>}
      {p.pdf && <p><a href={p.pdf} className="btn" target="_blank" rel="noreferrer">⬇ {d.pdf}</a></p>}
      <div className="prose" dangerouslySetInnerHTML={{ __html: p.html }} />
    </article>
  );
}
