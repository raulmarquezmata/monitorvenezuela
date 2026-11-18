import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ShareWA from "@/components/ShareWA";
import { informeById, informes } from "@/lib/data";
import { dl } from "@/lib/dl";
import type { Lang } from "@/lib/i18n";

// página liviana para compartir un informe con clientes: se arma al pedirla (no ocupa escrituras ISR)
export const dynamic = "force-dynamic";

const TOPICS: Record<string, { es: string; en: string }> = {
  petroleo: { es: "Petróleo y gas", en: "Oil & gas" }, electricidad: { es: "Electricidad", en: "Electricity" }, mineria: { es: "Minería", en: "Mining" },
  politica: { es: "Política", en: "Politics" }, economia: { es: "Economía", en: "Economy" }, finanzas: { es: "Banca y mercados", en: "Banking & markets" }, agro: { es: "Agro", en: "Agriculture" },
};

export async function generateMetadata({ params }: { params: { lang: Lang; id: string } }): Promise<Metadata> {
  const x = await informeById(params.id);
  if (!x) return {};
  const desc = (x.summary ?? "").slice(0, 200);
  return { title: `${x.title} · Grupo Solfín Research`, description: desc,
    openGraph: { title: x.title, description: desc, images: x.thumb_url ? [{ url: x.thumb_url }] : undefined, type: "article" } };
}

export default async function InformePage({ params }: { params: { lang: Lang; id: string } }) {
  const { lang } = params;
  const es = lang === "es";
  const x = await informeById(params.id);
  if (!x) notFound();
  const all = await informes();
  const related = all.filter((y) => y.id !== x.id && y.topic === x.topic).slice(0, 3);
  const month = (d: string) => new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const pageUrl = `https://radarsolfin.vercel.app/${lang}/informes/${x.id}`;
  const intro = es ? `Grupo Solfín · Research Desk\n${x.title}` : `Grupo Solfín · Research Desk\n${x.title}`;
  const mail = `mailto:?subject=${encodeURIComponent(x.title)}&body=${encodeURIComponent(`${intro}\n\n${x.summary ?? ""}\n\n${es ? "Leer el informe" : "Read the report"}: ${pageUrl}`)}`;
  return (
    <>
      <p style={{ margin: "0 0 14px" }}><Link prefetch={false} href={`/${lang}/informes`}>← {es ? "Todos los informes" : "All reports"}</Link></p>
      <div className="informe-share">
        {x.thumb_url && (
          <a href={dl(x.url, `informe:${x.title}`)} target="_blank" rel="noreferrer" className="portada">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x.thumb_url} alt="" />
          </a>
        )}
        <div>
          <div className="muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 14 }}>
            <span>Grupo Solfín · Research Desk</span>
            {x.date && <span>· {month(x.date).replace(/^./, (c) => c.toUpperCase())}</span>}
            <span className="tag">{TOPICS[x.topic]?.[lang] ?? x.topic}</span>
            <span className="tag">{(x.lang || "es").toUpperCase()}</span>
            {x.pages ? <span>{x.pages} {es ? "págs." : "pages"}</span> : null}
          </div>
          <h1 style={{ margin: "10px 0 14px", lineHeight: 1.2 }}>{x.title}</h1>
          {x.summary && <p className="stock-desc" style={{ fontSize: 17, lineHeight: 1.55 }}>{x.summary}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
            <a className="btn primary" href={dl(x.url, `informe:${x.title}`)} target="_blank" rel="noreferrer">⬇ {es ? "Leer el informe (PDF)" : "Read the report (PDF)"}</a>
            <ShareWA text={intro} url={pageUrl} label={es ? "Enviar por WhatsApp" : "Send via WhatsApp"} />
            <a className="btn" href={mail}>✉ {es ? "Enviar por correo" : "Send by email"}</a>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{es
            ? "Comparta este enlace en lugar del PDF: el cliente ve la portada y el resumen, y descarga el informe con un toque."
            : "Share this link instead of the PDF: the client sees the cover and summary, and downloads the report in one tap."}</p>
        </div>
      </div>
      {related.length > 0 && (
        <section className="section">
          <h2 style={{ fontSize: 18 }}>{es ? "Más informes de este tema" : "More reports on this topic"}</h2>
          <ul className="headlines">{related.map((y) => <li key={y.id}><Link prefetch={false} className="t" href={`/${lang}/informes/${y.id}`}>{y.title}</Link>{y.date && <div className="m"><span>{month(y.date)}</span></div>}</li>)}</ul>
        </section>
      )}
    </>
  );
}
