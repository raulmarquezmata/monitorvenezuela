"use client";
import { Children, useEffect, useState } from "react";

/** Pestañas por tema dentro de una página (cada pestaña es un grupo de tarjetas). Recuerda la pestaña en la
 *  dirección (#t-fiscal) y abre sola la que contiene la tarjeta enlazada (#fiscal_saldo_primario_spnf_pib). */
export default function Tabs({ tabs, children }: { tabs: { id: string; label: string; count?: number }[]; children: React.ReactNode }) {
  const panels = Children.toArray(children);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const pick = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h) return;
      const byTab = tabs.findIndex((t) => `t-${t.id}` === h);
      if (byTab >= 0) { setActive(byTab); return; }
      const el = document.getElementById(h);
      const panel = el?.closest("[data-tab]");
      if (panel) {
        setActive(Number(panel.getAttribute("data-tab")));
        setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "start" }), 60);
      }
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, [tabs]);
  const go = (i: number) => { setActive(i); history.replaceState(null, "", `#t-${tabs[i].id}`); };
  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => go(i)}>
            {t.label}{t.count ? <small>{t.count}</small> : null}
          </button>
        ))}
      </div>
      {panels.map((p, i) => <div key={tabs[i]?.id ?? i} role="tabpanel" data-tab={i} hidden={i !== active}>{p}</div>)}
    </div>
  );
}
