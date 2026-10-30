import Link from "next/link";
import { notFound } from "next/navigation";
import { LangSwitch, MainNav, ThemeSwitch } from "@/components/Nav";
import { CurrencyProvider } from "@/components/Currency";
import { RangeProvider } from "@/components/Range";
import { history, lastRun } from "@/lib/data";
import { isLang, LANGS, t } from "@/lib/i18n";
import { unstable_cache } from "next/cache";

type Pt = [string, number];
/** Diario en los últimos 3 años y semanal hacia atrás: basta para convertir a US$ y aligera cada página. */
function thin(pts: Pt[]): Pt[] {
  const cut = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
  const out: Pt[] = [];
  let wk = "";
  for (const p of pts) {
    if (p[0] >= cut) { out.push(p); continue; }
    const d = new Date(`${p[0]}T12:00:00Z`);
    const k = `${d.getUTCFullYear()}-${Math.floor((d.getTime() / 864e5 + 3) / 7)}`;
    if (k === wk) out[out.length - 1] = p; else { out.push(p); wk = k; }
  }
  return out;
}
const fxForCurrency = unstable_cache(async () => {
  const h = await history(["usd_bcv", "usd_paralelo"], 30);
  return { bcv: thin((h.usd_bcv ?? []) as Pt[]), par: thin((h.usd_paralelo ?? []) as Pt[]) };
}, ["fx-currency-v1"], { revalidate: 300 });

export const revalidate = 300;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: { lang: string } }) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const d = t(lang);
  const L = `/${lang}`;
  const items = [
    { href: L, label: d.nav.home, match: [L] },
    { href: `${L}/bvc`, label: d.nav.bvc, match: [`${L}/bvc`] },
    { href: `${L}/indicadores/cambiario`, label: d.nav.macro, match: [`${L}/indicadores`, `${L}/comercio`, `${L}/agro`, `${L}/herramientas`] },
    { href: `${L}/noticias`, label: d.nav.news, match: [`${L}/noticias`, `${L}/research`] },
    { href: `${L}/datos`, label: d.nav.data, match: [`${L}/datos`] },
  ];
  const [updated, fx] = await Promise.all([lastRun(), fxForCurrency()]);
  const upd = updated ? new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { timeZone: "America/Caracas", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(updated)) : "—";
  const live = updated ? Date.now() - Date.parse(updated) < 2 * 3600e3 : false;
  return (
    <CurrencyProvider fx={fx}>
    <RangeProvider>
      <header className="top">
        <div className="wrap">
          <Link href={L} className="brand"><i aria-hidden />{d.site}</Link>
          <MainNav items={items} />
          <div className="spacer" />
          <LangSwitch lang={lang} />
          <ThemeSwitch label={d.darkMode} />
        </div>
      </header>
      <div className="statusbar">
        <div className="wrap">
          <span><i className={`dot ${live ? "live" : ""}`} />{d.lastUpdate}: {upd} {d.vet}</span>
        </div>
      </div>
      <main><div className="wrap">{children}</div></main>
      <footer><div className="wrap">{d.disclaimer} · <Link href={`${L}/datos`}>{d.nav.data}</Link> · © {new Date().getFullYear()} {d.site}</div></footer>
    </RangeProvider>
    </CurrencyProvider>
  );
}
