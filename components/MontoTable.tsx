"use client";
import { useState } from "react";

type Row = { label: string; sub?: string; bs: number; of: number; par: number; n: number; vol: number };

/** Monto negociado de una acción por período, con filtro de moneda (Bs, US$ oficial, US$ paralelo). */
export default function MontoTable({ rows, lang, symbol }: { rows: Row[]; lang: "es" | "en"; symbol: string }) {
  const es = lang === "es";
  const [cur, setCur] = useState<"of" | "par" | "bs">("par");
  const loc = es ? "es-VE" : "en-US";
  const money = (v: number) => (v ? new Intl.NumberFormat(loc, { notation: v >= 1e5 ? "compact" : "standard", maximumFractionDigits: v >= 1e5 ? 1 : 0 }).format(v) : "—");
  const unit = cur === "bs" ? "Bs" : "US$";
  return (
    <div className="card">
      <div className="card-top"><h3>{es ? "Monto negociado" : "Traded amount"}</h3>
        <div className="seg" role="group">
          <button className={cur === "par" ? "on" : ""} onClick={() => setCur("par")}>{es ? "US$ paralelo" : "US$ parallel"}</button>
          <button className={cur === "of" ? "on" : ""} onClick={() => setCur("of")}>{es ? "US$ oficial" : "US$ official"}</button>
          <button className={cur === "bs" ? "on" : ""} onClick={() => setCur("bs")}>Bs</button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl compact" style={{ marginTop: 14 }}>
          <thead><tr><th>{es ? "Período" : "Period"}</th><th style={{ textAlign: "right" }}>{es ? `Monto (${unit})` : `Amount (${unit})`}</th>
            <th style={{ textAlign: "right" }}>{es ? "Acciones" : "Shares"}</th><th style={{ textAlign: "right" }}>{es ? "Sesiones" : "Sessions"}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}{r.sub && <div className="muted" style={{ fontSize: 12 }}>{r.sub}</div>}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>{unit === "US$" ? "US$ " : "Bs "}{money(r[cur])}</td>
              <td style={{ textAlign: "right" }}>{money(r.vol)}</td>
              <td style={{ textAlign: "right" }}>{r.n}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{es
        ? `Lo que se transó de ${symbol} en la última sesión y en lo que va de la semana, del mes y del año. En dólares, cada día se convierte con la tasa de ese día.`
        : `What was traded in ${symbol} in the last session and so far this week, month and year. In dollars, each day is converted at that day's rate.`}</p>
    </div>
  );
}
