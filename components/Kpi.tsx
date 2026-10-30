"use client";
import Link from "next/link";
import { fmtDateFor } from "@/lib/format";
import { change, defaultPeriods, PERIOD_LABEL, type Period } from "@/lib/stats";
import { CardControls, CardScope } from "./CardScope";
import { isBsUnit, useMoney } from "./Currency";

type Point = [string, number];
export type KpiMeta = {
  code: string; name: string; unit: string; decimals: number; frequency: string | null; pctUnit: boolean; href?: string; unitEs?: string | null;
};
export type Extra = { label: string; value: number | null; unit?: string; decimals?: number };

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


/** Fila de variaciones: día, semana, mes, en el año, interanual… (en % o en puntos para series en %). */
export function Stats({ points, periods, pctUnit, lang, extra }: { points: Point[]; periods: Period[]; pctUnit: boolean; lang: "es" | "en"; extra?: Extra[] }) {
  const loc = lang === "es" ? "es-VE" : "en-US";
  const nf = (v: number, d: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const items = extra ?? periods.map((p) => ({ label: PERIOD_LABEL[p][lang], value: change(points, p, pctUnit), unit: pctUnit ? " pp" : "%", decimals: pctUnit ? 1 : 2, signed: true }));
  return (
    <div className="stats">
      {items.map((it) => {
        const v = it.value;
        const signed = !extra;
        const cls = v == null || !signed ? "" : v > 0 ? "up" : v < 0 ? "down" : "";
        return (
          <span className="st" key={it.label}>
            <small>{it.label}</small>
            <b className={cls}>{v == null ? "—" : `${signed && v > 0 ? "+" : ""}${nf(v, it.decimals ?? 2)}${it.unit ?? ""}`}</b>
          </span>
        );
      })}
    </div>
  );
}

function KpiBody({ m, points: points0, lang, noData, periods, extra, sparkDays }: {
  m: KpiMeta; points: Point[]; lang: "es" | "en"; noData: string; periods: Period[]; extra?: Extra[]; sparkDays: number;
}) {
  const money = useMoney(points0, m.unitEs, m.unit, lang);
  const points = money.points;
  const last = points.at(-1);
  const loc = lang === "es" ? "es-VE" : "en-US";
  const nf = (v: number, d: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const cut = last ? new Date(Date.parse(`${last[0]}T00:00:00Z`) - sparkDays * 864e5).toISOString().slice(0, 10) : "";
  let spark = points.filter((p) => p[0] >= cut);
  if (spark.length < 6) spark = points.slice(-12);
  return (
    <>
      <div className="big">{last ? nf(last[1], money.converted ? 1 : m.decimals) : "—"}<small>{money.unit}</small></div>
      {last ? <Stats points={points} periods={periods} pctUnit={m.pctUnit} lang={lang} extra={extra} /> : <div className="muted">{noData}</div>}
      <div className="kpi-foot"><span /><Sparkline points={spark} /></div>
    </>
  );
}

/** Tarjeta de indicador: valor, variaciones propias de la serie y minigráfico. */
export function KpiCard({ m, points, lang, noData, periods, extra, rangeLabels }: {
  m: KpiMeta; points: Point[]; lang: "es" | "en"; noData: string; rangeLabels: Record<string, string>; periods?: Period[]; extra?: Extra[];
}) {
  const last = points.at(-1);
  const money = isBsUnit(m.unitEs);
  const sparkDays = m.frequency === "D" ? 92 : m.frequency === "W" ? 366 : 730;
  const head = <div className="card-top"><h3>{m.name}</h3><span className="date">{last ? fmtDateFor(last[0], m.frequency, lang) : ""}</span></div>;
  const body = (
    <CardScope>
      {head}
      {money && <CardControls lang={lang} money ranges={null} rangeLabels={rangeLabels} />}
      <KpiBody m={m} points={points} lang={lang} noData={noData} periods={periods ?? defaultPeriods(m.frequency)} extra={extra} sparkDays={sparkDays} />
    </CardScope>
  );
  return m.href && !money ? <Link href={m.href} className="card">{body}</Link> : <div className="card">{body}</div>;
}
