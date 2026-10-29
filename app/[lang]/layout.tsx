import Link from "next/link";
import { notFound } from "next/navigation";
import { LangSwitch, MainNav, ThemeSwitch } from "@/components/Nav";
import { CurrencyButtons, CurrencyProvider } from "@/components/Currency";
import { RangeButtons, RangeProvider } from "@/components/Range";
import { history, lastRun } from "@/lib/data";
import { isLang, LANGS, t } from "@/lib/i18n";

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
  const [updated, fx] = await Promise.all([lastRun(), history(["usd_bcv", "usd_paralelo"], 30)]);
  const upd = updated ? new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { timeZone: "America/Caracas", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(updated)) : "—";
  const live = updated ? Date.now() - Date.parse(updated) < 2 * 3600e3 : false;
  return (
    <CurrencyProvider fx={{ bcv: fx.usd_bcv ?? [], par: fx.usd_paralelo ?? [] }}>
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
          <span style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <CurrencyButtons labels={{ BS: "Bs", USD_BCV: lang === "es" ? "US$ oficial" : "US$ official", USD_PAR: lang === "es" ? "US$ paralelo" : "US$ parallel" }} />
            <span style={{ width: 1, height: 22, background: "var(--line)" }} />
            <RangeButtons labels={d.range as never} />
          </span>
        </div>
      </div>
      <main><div className="wrap">{children}</div></main>
      <footer><div className="wrap">{d.disclaimer} · <Link href={`${L}/datos`}>{d.nav.data}</Link> · © {new Date().getFullYear()} {d.site}</div></footer>
    </RangeProvider>
    </CurrencyProvider>
  );
}
