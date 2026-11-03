import { SubNav } from "./Nav";
import { t, type Lang } from "@/lib/i18n";

export default function NewsNav({ lang }: { lang: Lang }) {
  const d = t(lang);
  return <SubNav items={[
    { href: `/${lang}/noticias`, label: d.nav.headlines, exact: true },
    { href: `/${lang}/noticias/linea-de-tiempo`, label: d.nav.timeline },
    { href: `/${lang}/noticias/hemeroteca`, label: lang === "es" ? "Hemeroteca 2026" : "2026 archive" },
  ]} />;
}
