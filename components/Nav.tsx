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

/** Teléfono: botón ☰ que abre un panel con todas las secciones y sus subsecciones (como el menú de una app). */
export function MobileNav({ items, lang }: { items: Item[]; lang: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState<string | null>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.classList.toggle("drawer-open", open);
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const es = lang === "es";
  return (
    <>
      <button className="burger" aria-label={es ? "Abrir menú" : "Open menu"} aria-expanded={open} onClick={() => setOpen(true)}>
        <span /><span /><span />
      </button>
      {open && <div className="drawer-bg" onClick={() => setOpen(false)} />}
      <nav className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="drawer-head">
          <b>{es ? "Secciones" : "Sections"}</b>
          <button className="drawer-x" aria-label={es ? "Cerrar menú" : "Close menu"} onClick={() => setOpen(false)}>✕</button>
        </div>
        {items.map((i) => {
          const on = i.match.some((m) => (m.split("/").length === 2 ? path === m : path.startsWith(m)));
          const exp = sec === i.href || (sec === null && on);
          return (
            <div key={i.href} className={`dsec ${on ? "on" : ""}`}>
              {i.groups ? (
                <button className="dsec-t" aria-expanded={exp} onClick={() => setSec(exp ? "" : i.href)}>
                  {i.label}<span aria-hidden>{exp ? "−" : "+"}</span>
                </button>
              ) : (
                <Link prefetch={false} href={i.href} className="dsec-t" onClick={() => setOpen(false)}>{i.label}</Link>
              )}
              {i.groups && exp && (
                <div className="dsec-b">
                  {i.groups.map((g, k) => (
                    <div key={k}>
                      {g.label && <div className="navgroup-label">{g.label}</div>}
                      {g.items.map((x) => (
                        <Link prefetch={false} key={x.href} href={x.href} onClick={() => setOpen(false)}>
                          <b>{x.label}</b>{x.d && <small>{x.d}</small>}
                        </Link>))}
                    </div>))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

const ICONS: Record<string, JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  bvc: <path d="M4 20V10m6 10V4m6 16v-8m4 8H2" />,
  intl: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></>,
  macro: <path d="M3 20h18M5 16l4-5 4 3 6-8" />,
  research: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
};

/** Teléfono: barra inferior con las cinco secciones principales, como en una app. */
export function TabBar({ tabs }: { tabs: { href: string; label: string; icon: string; match: string[] }[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Secciones principales">
      {tabs.map((t) => {
        const on = t.match.some((m) => (m.split("/").length === 2 ? path === m : path.startsWith(m)));
        return (
          <Link prefetch={false} key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICONS[t.icon]}</svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
