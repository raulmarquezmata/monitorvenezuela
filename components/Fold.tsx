"use client";
import { useRef, useState } from "react";

/** Teléfono: bloque plegable con título y un dato de resumen; en computadora se ve siempre abierto. */
export function Fold({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mfold ${open ? "open" : ""}`}>
      <button className="mfold-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><b>{title}</b>{hint && <small>{hint}</small>}</span><i aria-hidden>{open ? "−" : "+"}</i>
      </button>
      <div className="mfold-b">{children}</div>
    </div>
  );
}

/** Teléfono: lista corta (las 2 primeras líneas) con «Ver más». */
export function Clamp({ children, more, less }: { children: React.ReactNode; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`clamp ${open ? "open" : ""}`}>
      {children}
      <button className="clamp-btn" onClick={() => setOpen(!open)}>{open ? less : more}</button>
    </div>
  );
}

/** Teléfono: el gráfico de una tarjeta queda oculto hasta tocar «Ver gráfico» (la cifra y las variaciones siguen visibles). */
export function ChartToggle({ lang }: { lang: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const es = lang === "es";
  return (
    <button ref={ref} className="chart-toggle" aria-expanded={open} onClick={() => {
      const card = ref.current?.closest(".card");
      card?.classList.toggle("show-chart", !open);
      setOpen(!open);
    }}>{open ? (es ? "Ocultar gráfico ▴" : "Hide chart ▴") : (es ? "Ver gráfico ▾" : "Show chart ▾")}</button>
  );
}
