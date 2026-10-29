"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; match: string[] };

export function MainNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="mainnav">
      {items.map((i) => {
        const on = i.match.some((m) => (m.split("/").length === 2 ? path === m : path.startsWith(m)));
        return <Link key={i.href} href={i.href} className={on ? "on" : ""}>{i.label}</Link>;
      })}
    </nav>
  );
}

export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="subnav">
      {items.map((i) => <Link key={i.href} href={i.href} className={(i.exact ? path === i.href : path.startsWith(i.href)) ? "on" : ""}>{i.label}</Link>)}
    </nav>
  );
}

export function LangSwitch({ lang }: { lang: string }) {
  const path = usePathname();
  const rest = path.replace(/^\/(es|en)/, "");
  return (
    <div className="seg">
      <Link href={`/es${rest}`} className={lang === "es" ? "on" : ""}>ES</Link>
      <Link href={`/en${rest}`} className={lang === "en" ? "on" : ""}>EN</Link>
    </div>
  );
}

/** Interruptor de modo oscuro; recuerda la elección en este navegador. */
export function ThemeSwitch({ label }: { label: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button className={`switch ${dark ? "on" : ""}`} onClick={toggle} aria-pressed={dark}>
      <span className="track" /><span>{label}</span>
    </button>
  );
}
