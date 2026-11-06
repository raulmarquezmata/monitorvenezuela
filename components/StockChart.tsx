"use client";
import { useState } from "react";
import LineChart from "./LineChart";
import { RangeButtons, RangeProvider, type Range } from "./Range";

type Point = [string, number];
type Labels = { logScale: string; table: string; chart: string; date: string; noData: string };

/** Gráfico de la acción: precio o capitalización, en Bs, en US$ (oficial / paralelo) o Bs y US$ juntos (dos ejes). */
export default function StockChart({ lang, symbol, bs, usdOf, usdPar, shares, labels, rangeLabels, initial = "1A", note }: {
  lang: "es" | "en"; symbol: string; bs: Point[]; usdOf: Point[]; usdPar: Point[]; shares: number | null; note?: string;
  labels: Labels; rangeLabels: Record<string, string>; initial?: Range;
}) {
  const es = lang === "es";
  const [measure, setMeasure] = useState<"price" | "cap">("price");
  const [view, setView] = useState<"dual" | "bs" | "of" | "par">("dual");
  const k = measure === "cap" && shares ? shares : 1;
  const scale = (pts: Point[]) => (k === 1 ? pts : pts.map(([d, v]) => [d, v * k] as Point));
  const nBs = es ? "Bs" : "Bs", nOf = es ? "US$ oficial" : "US$ official", nPar = es ? "US$ alternativo" : "US$ alternative";
  const right = es ? " (eje der.)" : " (right axis)";
  const series = view === "dual"
    ? [{ name: `${nBs}${es ? " (eje izq.)" : " (left axis)"}`, points: scale(bs), color: "var(--series-1)" },
       { name: nOf + right, points: scale(usdOf), color: "#1e7b45", axis: "right" as const },
       { name: nPar + right, points: scale(usdPar), color: "#d4a72c", axis: "right" as const, dash: true }]
    : view === "bs" ? [{ name: nBs, points: scale(bs) }]
    : view === "of" ? [{ name: nOf, points: scale(usdOf), color: "#1e7b45" }]
    : [{ name: nPar, points: scale(usdPar), color: "#d4a72c" }];
  const unit = view === "bs" ? "Bs" : view === "dual" ? undefined : "US$";
  const dec = measure === "cap" ? 0 : view === "bs" ? 2 : 4;
  return (
    <div className="card">
      <RangeProvider initial={initial}>
        <div className="card-top">
          <h3>{measure === "price" ? (es ? `Precio de ${symbol}` : `${symbol} price`) : (es ? `Capitalización de ${symbol}` : `${symbol} market cap`)}</h3>
          <span className="date">{view === "dual" ? (es ? "Bs y US$ en una sola vista" : "Bs and US$ in one view") : unit}</span>
        </div>
        <div className="stock-tools">
          <div className="seg" role="group">
            <button className={measure === "price" ? "on" : ""} onClick={() => setMeasure("price")}>{es ? "Precio" : "Price"}</button>
            {shares ? <button className={measure === "cap" ? "on" : ""} onClick={() => setMeasure("cap")}>{es ? "Capitalización" : "Market cap"}</button> : null}
          </div>
          <div className="seg" role="group">
            <button className={view === "dual" ? "on" : ""} onClick={() => setView("dual")}>Bs + US$</button>
            <button className={view === "bs" ? "on" : ""} onClick={() => setView("bs")}>Bs</button>
            <button className={view === "of" ? "on" : ""} onClick={() => setView("of")}>{nOf}</button>
            <button className={view === "par" ? "on" : ""} onClick={() => setView("par")}>{nPar}</button>
          </div>
          <span style={{ marginLeft: "auto" }}><RangeButtons labels={rangeLabels} /></span>
        </div>
        <LineChart series={series} lang={lang} unit={unit} decimals={dec} height={300} labels={labels} allowLog={view !== "dual"} />
        <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{es
          ? "Precio en US$ = precio en Bs del día ÷ tipo de cambio de ese día. Si la línea en Bs sube más que la de US$, la diferencia es devaluación."
          : "US$ price = Bs price of the day ÷ that day's exchange rate. When the Bs line rises faster than the US$ line, the gap is devaluation."}</p>
        {note && <p style={{ fontSize: 13, margin: "6px 0 0", color: "var(--text-2)" }}>⚖️ {note}</p>}
      </RangeProvider>
    </div>
  );
}
