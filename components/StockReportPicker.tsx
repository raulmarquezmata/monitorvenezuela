"use client";
import { useState } from "react";

/** Elegir una empresa y bajar su informe PDF. */
export default function StockReportPicker({ items, lang }: { items: { symbol: string; name: string; url: string }[]; lang: "es" | "en" }) {
  const es = lang === "es";
  const [sel, setSel] = useState(items[0]?.symbol ?? "");
  const it = items.find((i) => i.symbol === sel);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label={es ? "Empresa" : "Company"} style={{ maxWidth: 260 }}>
        {items.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol} · {i.name}</option>)}
      </select>
      {it && <a className="btn primary" href={it.url} target="_blank" rel="noreferrer">⬇ PDF</a>}
    </div>
  );
}
