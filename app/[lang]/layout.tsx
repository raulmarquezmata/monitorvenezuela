import Link from "next/link";
import { SolfinIso } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { notFound } from "next/navigation";
import { HashOpener, LangSwitch, MainNav, MobileNav, TabBar, ThemeSwitch } from "@/components/Nav";
import { CurrencyProvider } from "@/components/Currency";
import { RangeProvider } from "@/components/Range";
import { history, lastRun } from "@/lib/data";
import LastUpdate from "@/components/LastUpdate";
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
}, ["fx-currency-v1"], { revalidate: 300, tags: ["datos"] });

export const revalidate = 300;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: { lang: string } }) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const d = t(lang);
  const L = `/${lang}`;
  const es = lang === "es";
  const I = (href: string, label: string, dsc?: string) => ({ href: `${L}${href}`, label, d: dsc });
  const items = [
    { href: L, label: d.nav.home, match: [L] },
    { href: `${L}/bvc`, label: d.nav.bvc, match: [`${L}/bvc`], groups: [{ items: [
      I("/bvc", es ? "Resumen e IBC" : "Overview and IBC", es ? "Índice, rendimiento en Bs y US$, capitalización y monto negociado" : "Index, return in Bs and US$, market cap and turnover"),
      I("/bvc#acciones", es ? "Acciones" : "Equities", es ? "Todas las acciones del día; clic en una para ver su ficha" : "Every stock today; click one to open its page"),
      I("/bvc#renta-fija", es ? "Renta fija" : "Fixed income", es ? "Papeles comerciales, obligaciones y títulos negociados" : "Commercial paper, bonds and notes traded"),
      I("/bvc#indices", es ? "Índices sectoriales y BOLPRIAVEN" : "Sector indices and BOLPRIAVEN"),
      I("/bvc#descargas", es ? "Descargas (PDF y Excel)" : "Downloads (PDF and Excel)", es ? "Informe de cierre, capitalización, semanal y datos" : "Closing, market cap and weekly reports, and data"),
    ] }] },
    { href: `${L}/internacional`, label: d.nav.intl, match: [`${L}/internacional`], groups: [{ items: [
      I("/internacional", es ? "Resumen de mercados" : "Market overview", es ? "Bolsas, VIX, dólar, oro, bitcoin y Tesoro a 10 años" : "Equities, VIX, dollar, gold, bitcoin and 10-year Treasury"),
      I("/internacional#mapa", es ? "Mapa del S&P 500" : "S&P 500 map", es ? "Rendimiento por sector y empresa; mayores alzas y caídas" : "Return by sector and company; top gainers and losers"),
      I("/internacional#fed", es ? "EE.UU.: inflación, empleo y la Fed" : "US: inflation, jobs and the Fed", es ? "IPC, nómina no agrícola, probabilidades de la Fed y calendario" : "CPI, payrolls, Fed probabilities and calendar"),
      I("/internacional#tesoro", es ? "Tasas del Tesoro" : "Treasury yields", es ? "Curva de rendimientos de 2 a 30 años" : "Yield curve, 2 to 30 years"),
      I("/internacional/graficos", es ? "Gráficos con toda la historia" : "Full-history charts", es ? "Bolsas, activos y región desde 2016" : "Equities, assets and the region since 2016"),
    ] }] },
    { href: `${L}/indicadores/cambiario`, label: d.nav.macro, match: [`${L}/indicadores`, `${L}/comercio`, `${L}/agro`], groups: [
      { label: es ? "Economía" : "Economy", items: [
        I("/indicadores/cambiario", es ? "Cambiario" : "FX", es ? "Dólar oficial y alternativo, euro y brecha" : "Official and alternative dollar, euro and gap"),
        I("/indicadores/monetario", es ? "Monetario" : "Monetary", es ? "Liquidez, base monetaria y multiplicador" : "Money supply, base and multiplier"),
        I("/indicadores/precios", es ? "Precios" : "Prices", es ? "Inflación mensual, acumulada e interanual" : "Monthly, cumulative and annual inflation"),
        I("/indicadores/actividad", es ? "Actividad y fiscal" : "Activity & fiscal", es ? "PIB trimestral y recaudación del SENIAT" : "Quarterly GDP and SENIAT collection") ] },
      { label: es ? "Petróleo y materias primas" : "Oil & commodities", items: [
        I("/indicadores/petroleo", es ? "Petróleo y gas" : "Oil & gas", es ? "Producción, cesta Merey, Brent, WTI y gas" : "Output, Merey, Brent, WTI and gas"),
        I("/indicadores/commodities", es ? "Materias primas" : "Commodities", es ? "Oro, hierro, aluminio, granos, café, cacao" : "Gold, iron ore, aluminum, grains, coffee, cocoa"),
        I("/agro", "Agro", es ? "Producción e importaciones de alimentos (USDA)" : "Food output and imports (USDA)") ] },
      { label: es ? "Sector externo" : "External sector", items: [
        I("/indicadores/externo", es ? "Reservas y balanza de pagos" : "Reserves & balance of payments", es ? "Reservas del BCV y exportaciones petroleras" : "BCV reserves and oil exports"),
        I("/comercio", es ? "Comercio exterior" : "Foreign trade", es ? "Qué vende y compra Venezuela, según sus socios" : "What Venezuela sells and buys, per partners"),
        I("/indicadores/deuda", es ? "Deuda" : "Debt", es ? "Riesgo país (EMBI) y bonos" : "Country risk (EMBI) and bonds") ] },
      { label: es ? "Banca" : "Banking", items: [
        I("/indicadores/banca", es ? "Banca" : "Banking", es ? "Créditos, captaciones y ranking de bancos" : "Loans, deposits and bank ranking") ] },
    ] },
    { href: `${L}/informes`, label: d.nav.research, match: [`${L}/informes`, `${L}/research`], groups: [{ items: [
      I("/informes", es ? "Todos los informes" : "All reports", es ? "Research Desk de Grupo Solfín, del más reciente al más antiguo" : "Grupo Solfín Research Desk, newest first"),
      I("/informes?tema=petroleo", es ? "Petróleo y gas" : "Oil & gas"),
      I("/informes?tema=finanzas", es ? "Banca y mercados" : "Banking & markets"),
      I("/informes?tema=economia", es ? "Economía" : "Economy"),
      I("/informes?tema=politica", es ? "Política" : "Politics"),
    ] }] },
    { href: `${L}/noticias`, label: d.nav.news, match: [`${L}/noticias`], groups: [{ items: [
      I("/noticias", d.nav.headlines, es ? "Noticias financieras y económicas del día" : "Today's financial and economic news"),
      I("/noticias/linea-de-tiempo", d.nav.timeline, es ? "Los hechos clave de 2026" : "Key events of 2026"),
      I("/noticias/hemeroteca", es ? "Hemeroteca 2026" : "2026 archive", es ? "Todas las noticias por mes" : "All news by month"),
    ] }] },
  ];
  const [updated, fx] = await Promise.all([lastRun(), fxForCurrency()]);
  return (
    <CurrencyProvider fx={fx}>
    <RangeProvider>
      <header className="top">
        <div className="wrap">
          <Link prefetch={false} href={L} className="brand">
            {BRAND === "solfin" ? (
              <><SolfinIso size={30} /><span className="brand-app">Radar Solfin</span></>
            ) : (<><i aria-hidden />{d.site}</>)}
          </Link>
          <MainNav items={items} />
          <div className="spacer" />
          <LangSwitch lang={lang} />
          <ThemeSwitch label={d.darkMode} />
          <MobileNav items={items} lang={lang} />
        </div>
      </header>
      <div className="statusbar">
        <div className="wrap">
          <LastUpdate initial={updated} lang={lang} label={d.lastUpdate} vet={d.vet} />
        </div>
      </div>
      <HashOpener />
      <main><div className="wrap">{children}</div></main>
      <footer><div className="wrap">
        <div className="foot-links">
          <Link prefetch={false} href={`${L}/herramientas`}>{d.nav.tools}</Link>
          <Link prefetch={false} href={`${L}/datos`}>{lang === "es" ? "Fuentes y metodología" : "Sources & methodology"}</Link>
          <Link prefetch={false} href={`${L}/noticias/linea-de-tiempo`}>{d.nav.timeline}</Link>
        </div>
        {d.disclaimer} · © {new Date().getFullYear()} {d.site}
      </div></footer>
      <TabBar tabs={[
        { href: L, label: d.nav.home, icon: "home", match: [L] },
        { href: `${L}/bvc`, label: es ? "Bolsa" : "Stocks", icon: "bvc", match: [`${L}/bvc`] },
        { href: `${L}/internacional`, label: es ? "Mundo" : "Global", icon: "intl", match: [`${L}/internacional`] },
        { href: `${L}/indicadores/cambiario`, label: "Macro", icon: "macro", match: [`${L}/indicadores`, `${L}/comercio`, `${L}/agro`] },
        { href: `${L}/informes`, label: es ? "Informes" : "Reports", icon: "research", match: [`${L}/informes`, `${L}/research`] },
      ]} />
    </RangeProvider>
    </CurrencyProvider>
  );
}
