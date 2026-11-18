"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavLink = { href: string; label: string; d?: string };
export type NavGroup = { label?: string; items: NavLink[] };
type Item = { href: string; label: string; match: string[]; groups?: NavGroup[] };

/** Menú principal: cada sección con subsecciones despliega un panel al pasar el cursor (o con el teclado). */
export function MainNav({ items }: { items: Item[] }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [path]);
  return (
    <nav className="mainnav">
      {items.map((i) => {
        const on = i.match.some((m) => (m.split("/").length === 2 ? path === m : path.startsWith(m)));
        const wide = (i.groups?.length ?? 0) > 1;
        return (
          <div key={i.href} className={`navitem ${i.groups ? "has-menu" : ""} ${wide ? "mega" : ""} ${open === i.href ? "open" : ""}`}
            onMouseEnter={() => i.groups && setOpen(i.href)} onMouseLeave={() => setOpen(null)}>
            <Link prefetch={false} href={i.href} className={on ? "on" : ""} aria-haspopup={i.groups ? "true" : undefined}
              aria-expanded={i.groups ? open === i.href : undefined}>{i.label}{i.groups && <span className="caret" aria-hidden>▾</span>}</Link>
            {i.groups && (
              <div className={`navmenu ${wide ? "wide" : ""}`} role="menu">
                {i.groups.map((g, k) => (
                  <div key={k} className="navgroup">
                    {g.label && <div className="navgroup-label">{g.label}</div>}
                    {g.items.map((x) => (
                      <Link prefetch={false} key={x.href} href={x.href} role="menuitem" className={path === x.href.split("#")[0] && !x.href.includes("#") ? "cur" : ""}
                        onClick={() => setOpen(null)}>
                        <b>{x.label}</b>{x.d && <small>{x.d}</small>}
                      </Link>))}
                  </div>))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Si la dirección apunta a un desplegable (#renta-fija, #indices…), lo abre y lo muestra. */
export function HashOpener() {
  const path = usePathname();
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      const det = el?.tagName === "DETAILS" ? el : el?.closest("details");
      if (det && !(det as HTMLDetailsElement).open) { (det as HTMLDetailsElement).open = true; el?.scrollIntoView({ block: "start" }); }
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [path]);
  return null;
}

export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="subnav">
      {items.map((i) => <Link prefetch={false} key={i.href} href={i.href} className={(i.exact ? path === i.href : path.startsWith(i.href)) ? "on" : ""}>{i.label}</Link>)}
    </nav>
  );
}

export function LangSwitch({ lang }: { lang: string }) {
  const path = usePathname();
  const rest = path.replace(/^\/(es|en)/, "");
  return (
    <div className="seg">
      <Link prefetch={false} href={`/es${rest}`} className={lang === "es" ? "on" : ""}>ES</Link>
      <Link prefetch={false} href={`/en${rest}`} className={lang === "en" ? "on" : ""}>EN</Link>
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
