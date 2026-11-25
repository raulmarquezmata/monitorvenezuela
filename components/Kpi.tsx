"use client";
import Link from "next/link";
import { fmtDateFor } from "@/lib/format";
import { change, defaultPeriods, PERIOD_LABEL, type Period } from "@/lib/stats";
import { CardControls, CardScope } from "./CardScope";
import { isBsUnit, useMoney } from "./Currency";
import { EXPLAIN, isInverted } from "@/lib/semantics";

type Point = [string, number];
export type KpiMeta = {
  code: string; name: string; unit: string; decimals: number; frequency: string | null; pctUnit: boolean; href?: string; unitEs?: string | null;
};
export type Extra = { label: string; value: number | null; unit?: string; decimals?: number };

export function Sparkline({ points, w = 180, h = 54, area = false, fluid = false }: { points: Point[]; w?: number; h?: number; area?: boolean; fluid?: boolean }) {
  if (points.length < 2) return <svg className="spark" width={fluid ? "100%" : w} height={h} />;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const vs = points.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const y = (v: number) => (hi === lo ? h / 2 : h - 3 - ((v - lo) / (hi - lo)) * (h - 6));
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  return (
    <svg className="spark" width={fluid ? "100%" : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={fluid ? "none" : undefined} aria-hidden>
      {area && <path d={`${d}L${w},${h}L0,${h}Z`} fill="var(--area)" />}
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect={fluid ? "non-scaling-stroke" : undefined} />
    </svg>
  );
}


/** Fila de variaciones: día, semana, mes, en el año, interanual… (en % o en puntos para series en %). */
export function Stats({ points, periods, pctUnit, lang, extra, bps, invert = false }: { points: Point[]; periods: Period[]; pctUnit: boolean; lang: "es" | "en"; extra?: Extra[]; bps?: boolean;
  /** subir es mala noticia (dólar, inflación, riesgo país): rojo al subir, verde al bajar */ invert?: boolean }) {
  const loc = lang === "es" ? "es-VE" : "en-US";
  const nf = (v: number, d: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  // tasas del Tesoro: en puntos básicos, igual que la tabla de la curva
  const items = extra ?? periods.map((p) => {
    const v = change(points, p, pctUnit);
    return bps ? { label: PERIOD_LABEL[p][lang], value: v == null ? null : Math.round(v * 100), unit: lang === "es" ? " pb" : " bp", decimals: 0, signed: true }
      : { label: PERIOD_LABEL[p][lang], value: v, unit: pctUnit ? " pp" : "%", decimals: pctUnit ? 1 : 2, signed: true };
  });
  return (
    <div className="stats">
      {items.map((it) => {
        const v = it.value;
        const signed = !extra;
        const good = v == null || !signed || v === 0 ? null : (v > 0) !== invert;
        const cls = good == null ? "" : good ? "up" : "down";
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
      {last ? <Stats points={points} periods={periods} pctUnit={m.pctUnit} lang={lang} extra={extra} bps={m.code.startsWith("ust_")} invert={isInverted(m.code)} /> : <div className="muted">{noData}</div>}
      {spark.length > 1 && (() => {
        // minigráfico a todo el ancho, con el mínimo y el máximo del tramo que muestra
        const lo = spark.reduce((a, p) => (p[1] < a[1] ? p : a)), hi = spark.reduce((a, p) => (p[1] > a[1] ? p : a));
        const loc = lang === "es" ? "es-VE" : "en-US";
        const fd = (d: string) => m.frequency === "D" || m.frequency === "W"
          ? new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "")
          : m.frequency === "M" ? new Intl.DateTimeFormat(loc, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "")
          : fmtDateFor(d, m.frequency, lang);
        return (
          <div className="kpi-spark">
            <Sparkline points={spark} w={300} h={58} area fluid />
            <div className="kpi-range"><span>{lang === "es" ? "mín." : "low"} {nf(lo[1], money.converted ? 1 : m.decimals)} · {fd(lo[0])}</span>
              <span>{lang === "es" ? "máx." : "high"} {nf(hi[1], money.converted ? 1 : m.decimals)} · {fd(hi[0])}</span></div>
          </div>
        );
      })()}
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
  const info = EXPLAIN[m.code]?.[lang];
  const head = <div className="card-top"><h3 title={info}>{m.name}</h3><span className="date">{last ? fmtDateFor(last[0], m.frequency, lang) : ""}</span></div>;
  const body = (
    <CardScope>
      {head}
      {money && <CardControls lang={lang} money ranges={null} rangeLabels={rangeLabels} />}
      <KpiBody m={m} points={points} lang={lang} noData={noData} periods={periods ?? defaultPeriods(m.frequency)} extra={extra} sparkDays={sparkDays} />
    </CardScope>
  );
  return m.href && !money ? <Link prefetch={false} href={m.href} className="card">{body}</Link> : <div className="card">{body}</div>;
}
