"use client";
import { useState } from "react";
import LineChart from "./LineChart";

type Point = [string, number];
type Bond = { ticker: string; issuer: string; coupon: number | null; maturity: string | null; name: string };

const before = (pts: Point[], d: string) => { let v: Point | null = null; for (const p of pts) { if (p[0] <= d) v = p; else break; } return v; };

export default function BondsTable({ lang, list, prices }: { lang: "es" | "en"; list: Bond[]; prices: Record<string, Point[]> }) {
  const es = lang === "es";
  const [sel, setSel] = useState<string | null>(list[0]?.ticker ?? null);
  const nf = (v: number | null | undefined, d = 3) => v == null ? "—" : new Intl.NumberFormat(es ? "es-VE" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const rows = list.map((b) => {
    const pts = prices[b.ticker] ?? [];
    const last = pts.at(-1);
    if (!last) return { b, last: null as Point | null, d1: null, wtd: null, ytd: null };
    const prevPt = pts.length > 1 ? pts[pts.length - 2] : null;
    const prev = prevPt && (Date.parse(last[0]) - Date.parse(prevPt[0])) / 864e5 <= 4 ? prevPt : null; // solo si es la sesión anterior
    const dt = new Date(`${last[0]}T00:00:00Z`);
    const friday = new Date(dt); friday.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 2) % 7 || 7));
    const wk = before(pts, friday.toISOString().slice(0, 10));
    const ye = before(pts, `${Number(last[0].slice(0, 4)) - 1}-12-31`);
    const ch = (p: Point | null) => (p && p[1] ? (last[1] / p[1] - 1) * 100 : null);
    return { b, last, d1: ch(prev), wtd: ch(wk), ytd: ch(ye) };
  });
  const cell = (v: number | null) => <td className={v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : ""}>{v == null ? "—" : `${v > 0 ? "+" : ""}${nf(v, 2)}%`}</td>;
  const groups = [["VENZ", es ? "República" : "Republic"], ["PDVSA", "PDVSA"]] as const;
  const chosen = list.find((b) => b.ticker === sel);
  if (!list.length) return <div className="empty" style={{ marginTop: 16 }}>{es ? "Sin precios todavía: sube data/bonos/bloomberg.xlsx" : "No prices yet"}</div>;
  return (
    <>
      <div className="tbl-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>{es ? "Bono" : "Bond"}</th><th className="l">Ticker</th><th>{es ? "Último" : "Last"}</th><th>%1D</th><th>{es ? "%Semana" : "%WTD"}</th><th>%YTD</th><th>{es ? "Fecha" : "Date"}</th></tr></thead>
          {groups.map(([iss, label]) => (
            <tbody key={iss}>
              <tr><td colSpan={7} className="l" style={{ fontWeight: 600, color: "var(--text-2)", paddingTop: 18 }}>{label}</td></tr>
              {rows.filter((r) => r.b.issuer === iss).map((r) => (
                <tr key={r.b.ticker} onClick={() => setSel(r.b.ticker)} style={{ cursor: "pointer", fontWeight: r.b.ticker === sel ? 600 : 400 }}>
                  <td className="l">{r.b.name}</td><td className="l muted">{r.b.ticker}</td><td>{nf(r.last?.[1])}</td>
                  {cell(r.d1)}{cell(r.wtd)}{cell(r.ytd)}<td className="muted">{r.last?.[0] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {chosen && (
        <div style={{ marginTop: 20 }}>
          <div className="card-top"><h3>{chosen.name}</h3><span className="date">{chosen.ticker}</span></div>
          <LineChart lang={lang} decimals={3} height={240} unit="%" ignoreRange={false} minPoints={4}
            labels={{ logScale: "Log", table: es ? "Tabla" : "Table", chart: es ? "Gráfico" : "Chart", date: es ? "Fecha" : "Date", noData: "—" }}
            series={[{ name: chosen.name, points: prices[chosen.ticker] ?? [] }]} />
        </div>
      )}
    </>
  );
}
