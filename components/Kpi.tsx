"use client";
import Link from "next/link";
import { fmtDateFor } from "@/lib/format";
import { useMoney } from "./Currency";
import { useRange, windowed } from "./Range";

type Point = [string, number];
export type KpiMeta = {
  code: string; name: string; unit: string; decimals: number; frequency: string | null; pctUnit: boolean; href?: string; unitEs?: string | null;
};

export function Sparkline({ points, w = 180, h = 54, area = false }: { points: Point[]; w?: number; h?: number; area?: boolean }) {
  if (points.length < 2) return <svg className="spark" width={w} height={h} />;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const vs = points.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const y = (v: number) => (hi === lo ? h / 2 : h - 3 - ((v - lo) / (hi - lo)) * (h - 6));
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {area && <path d={`${d}L${w},${h}L0,${h}Z`} fill="var(--area)" />}
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Tarjeta de indicador: valor, variación en el rango global y minigráfico. */
export function KpiCard({ m, points: points0, lang, noData, rangeLabels }: {
  m: KpiMeta; points: Point[]; lang: "es" | "en"; noData: string; rangeLabels: Record<string, string>;
}) {
  const { range } = useRange();
  const money = useMoney(points0, m.unitEs, m.unit, lang);
  const points = money.points;
  const unit = money.unit;
  const loc = lang === "es" ? "es-VE" : "en-US";
  const win = windowed(points, range, 2);                       // base de la variación
  const spark = windowed(points, range, m.frequency === "D" ? 5 : 8); // minigráfico con al menos varios puntos
  const last = points.at(-1);
  const first = win[0];
  const ch = last && first && first !== last ? (m.pctUnit ? last[1] - first[1] : first[1] ? (last[1] / first[1] - 1) * 100 : null) : null;
  const cls = ch == null || Math.abs(ch) < 1e-9 ? "flat" : ch > 0 ? "up" : "down";
  const nf = (v: number, d: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const body = (
    <>
      <div className="card-top"><h3>{m.name}</h3><span className="date">{last ? fmtDateFor(last[0], m.frequency, lang) : ""}</span></div>
      <div className="big">{last ? nf(last[1], money.converted ? 1 : m.decimals) : "—"}<small>{unit}</small></div>
      <div className="kpi-foot">
        <span className={`delta ${cls}`}>
          {ch == null ? <span className="muted">{last ? "" : noData}</span> : <>{cls === "up" ? "▲" : cls === "down" ? "▼" : "▬"} {ch > 0 ? "+" : ch < 0 ? "−" : ""}{nf(Math.abs(ch), m.pctUnit ? 1 : 2)}{m.pctUnit ? " pp" : "%"}<small>{rangeLabels[range]}</small></>}
        </span>
        <Sparkline points={spark} />
      </div>
    </>
  );
  return m.href ? <Link href={m.href} className="card">{body}</Link> : <div className="card">{body}</div>;
}
