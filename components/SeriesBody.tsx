"use client";
import { useMoney } from "./Currency";
import LineChart from "./LineChart";
import { Stats } from "./Kpi";
import type { Period } from "@/lib/stats";

type Point = [string, number];

/** Valor actual + gráfico de una serie; respeta la moneda global (Bs o US$). */
export default function SeriesBody({ name, points, unitEs, unit, decimals, lang, height, allowLog, bars, area, labels, stats, logDefault = false, hiLo = false }: {
  name: string; points: Point[]; unitEs: string | null; unit: string; decimals: number; lang: "es" | "en"; height: number;
  allowLog: boolean; bars: boolean; area: boolean; labels: { logScale: string; table: string; chart: string; date: string; noData: string };
  stats?: { periods: Period[]; pctUnit: boolean }; logDefault?: boolean; hiLo?: boolean;
}) {
  const m = useMoney(points, unitEs, unit, lang);
  const last = m.points.at(-1);
  const dec = m.converted ? 1 : Math.min(decimals, 2);
  const nf = (v: number) => new Intl.NumberFormat(lang === "es" ? "es-VE" : "en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  return (
    <>
      <div className="big" style={{ fontSize: 34, margin: "12px 0 4px" }}>{last ? nf(last[1]) : "—"}<small>{m.unit}</small></div>
      {m.converted && <div className="muted" style={{ fontSize: 13 }}>{m.note}</div>}
      {stats && <Stats points={m.points} periods={stats.periods} pctUnit={stats.pctUnit} lang={lang} />}
      {hiLo && last && (() => {
        const cut = new Date(Date.parse(`${last[0]}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
        const yr = m.points.filter((p) => p[0] >= cut);
        if (yr.length < 5) return null;
        const hi = yr.reduce((a, p) => (p[1] > a[1] ? p : a)), lo = yr.reduce((a, p) => (p[1] < a[1] ? p : a));
        const fd = (d: string) => new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
        const pos = hi[1] > lo[1] ? ((last[1] - lo[1]) / (hi[1] - lo[1])) * 100 : 50;
        return (
          <div className="hilo">
            <span><small>{lang === "es" ? "Mín. 52 sem." : "52-wk low"}</small><b>{nf(lo[1])}</b><small>{fd(lo[0])}</small></span>
            <div className="hilo-bar"><i style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} /></div>
            <span style={{ textAlign: "right" }}><small>{lang === "es" ? "Máx. 52 sem." : "52-wk high"}</small><b>{nf(hi[1])}</b><small>{fd(hi[0])}</small></span>
          </div>
        );
      })()}
      <LineChart series={[{ name, points: m.points }]} lang={lang} unit={m.unit} decimals={m.converted ? 1 : decimals}
        height={height} allowLog={allowLog} bars={bars} area={area} labels={labels} logDefault={logDefault} />
    </>
  );
}
