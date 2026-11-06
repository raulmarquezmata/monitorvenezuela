"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRange, windowed } from "./Range";

type Point = [string, number];
type S = { name: string; points: Point[]; color?: string; axis?: "right"; dash?: boolean };
type Labels = { logScale: string; table: string; chart: string; date: string; noData: string };
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "#8a6fb0", "#3d7ea6", "#c79a2e", "#b5473a", "#5c9e6e"];
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) { const d = Math.abs(min) * 0.05 || 1; min -= d; max += d; }
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++)
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= min && v <= max) out.push(v); }
  if (out.length <= 7) return out;
  const pow = out.filter((v) => Math.abs(Math.log10(v) % 1) < 1e-9);
  const k = Math.ceil(pow.length / 6);
  return pow.filter((_, i) => i % k === 0);
}

export default function LineChart({
  series, lang, unit, decimals = 2, height = 240, allowLog = false, labels, area = false, ignoreRange = false, minPoints = 12, bars = false, logDefault = false, gap, clip = false,
}: {
  series: S[]; lang: "es" | "en"; unit?: string | null; decimals?: number; height?: number; allowLog?: boolean;
  labels: Labels; area?: boolean; ignoreRange?: boolean; minPoints?: number; bars?: boolean; logDefault?: boolean;
  /** Muestra en el tooltip la brecha entre dos series: serie[b] ÷ serie[a] − 1. */
  gap?: { a: number; b: number; label: string };
  /** Barras: si hay un valor atípico, recorta el eje para que el resto se lea (la barra atípica se marca y su valor real sale al pasar el cursor). */
  clip?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { range } = useRange();
  const [w, setW] = useState(600);
  const [log, setLog] = useState(logDefault);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const loc = lang === "es" ? "es-VE" : "en-US";
  const fmt = (v: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  const fmtAxis = (v: number) => v !== 0 && Math.abs(v) < 0.01
    ? new Intl.NumberFormat(loc, { notation: "scientific", maximumFractionDigits: 0 }).format(v)
    : new Intl.NumberFormat(loc, { notation: Math.abs(v) >= 1e5 ? "compact" : "standard", maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }).format(v);
  const fmtDate = (d: string, long = false) => new Intl.DateTimeFormat(loc, long ? { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(ts(d)));

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => series.map((s, i) => {
    let pts = ignoreRange ? s.points : windowed(s.points, range, minPoints);
    if (log) pts = pts.filter((p) => p[1] > 0);
    if (pts.length > 1500) { const k = Math.ceil(pts.length / 1500); pts = pts.filter((_, j) => j % k === 0 || j === pts.length - 1); }
    return { ...s, color: s.color ?? COLORS[i % COLORS.length], pts };
  }), [series, range, log, ignoreRange, minPoints]);

  const all = data.flatMap((s) => s.pts);
  const left = data.filter((s) => s.axis !== "right").flatMap((s) => s.pts);
  const right = data.filter((s) => s.axis === "right").flatMap((s) => s.pts);
  const dual = right.length > 0 && left.length > 0;
  const hasData = all.length > 0;
  const spanDays = hasData ? (Math.max(...all.map((p) => ts(p[0]))) - Math.min(...all.map((p) => ts(p[0])))) / 864e5 : 0;
  const padL = 56, padR = dual ? 50 : 12, padT = 10, padB = 26;
  const iw = w - padL - padR, ih = height - padT - padB;
  let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
  if (hasData) {
    x0 = Math.min(...all.map((p) => ts(p[0]))); x1 = Math.max(...all.map((p) => ts(p[0])));
    const yAll = dual ? left : all;
    y0 = Math.min(...yAll.map((p) => p[1])); y1 = Math.max(...yAll.map((p) => p[1]));
    if (bars) y0 = Math.min(0, y0);
    if (bars && clip && !dual) {
      const vs = yAll.map((p) => p[1]).filter((v) => v > 0).sort((a, b) => a - b);
      const ref = vs.length >= 5 ? vs[Math.floor(vs.length * 0.85)] : 0;
      if (ref > 0 && y1 > ref * 3) y1 = ref * 1.6;
    }
  }
  const cap = (v: number) => (bars && clip ? Math.min(v, y1) : v);
  const yt = log ? logTicks(y0, y1) : niceTicks(y0, y1);
  const ylo = log ? y0 : Math.min(y0, yt[0] ?? y0), yhi = log ? y1 : Math.max(y1, yt.at(-1) ?? y1);
  const bw = bars && data[0]?.pts.length ? Math.max(2, (iw / data[0].pts.length) * 0.7) : 0;
  const X = (t: number) => padL + bw / 2 + (x1 === x0 ? (iw - bw) / 2 : ((t - x0) / (x1 - x0)) * (iw - bw));
  const Y = (v: number) => {
    if (log) { const a = Math.log10(ylo), b = Math.log10(yhi); return padT + ih - (b === a ? .5 : (Math.log10(v) - a) / (b - a)) * ih; }
    return padT + ih - (yhi === ylo ? .5 : (v - ylo) / (yhi - ylo)) * ih;
  };
  // eje derecho (segunda escala, p. ej. precio en US$ junto al precio en Bs)
  let r0 = 0, r1 = 1;
  if (dual) { r0 = Math.min(...right.map((p) => p[1])); r1 = Math.max(...right.map((p) => p[1])); }
  const rt = dual ? niceTicks(r0, r1) : [];
  const rlo = Math.min(r0, rt[0] ?? r0), rhi = Math.max(r1, rt.at(-1) ?? r1);
  const YR = (v: number) => padT + ih - (rhi === rlo ? .5 : (v - rlo) / (rhi - rlo)) * ih;
  const Ys = (s: { axis?: "right" }) => (dual && s.axis === "right" ? YR : Y);
  const nX = Math.max(2, Math.min(6, Math.floor(iw / 100)));
  const xt = hasData ? Array.from({ length: nX }, (_, i) => x0 + ((x1 - x0) * i) / (nX - 1)) : [];
  const base = data[0]?.pts ?? [];
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!base.length) return;
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const t = x0 + ((e.clientX - rect.left - bw / 2) / (rect.width - bw)) * (x1 - x0);
    let lo = 0, hi = base.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts(base[m][0]) < t) lo = m; else hi = m; }
    setHover(Math.abs(ts(base[lo][0]) - t) < Math.abs(ts(base[hi][0]) - t) ? lo : hi);
  };
  const valueAt = (pts: Point[], d: string) => { let v: number | undefined; for (const p of pts) { if (p[0] <= d) v = p[1]; else break; } return v; };
  const hp = hover !== null ? base[hover] : null;
  const tipLeft = hp ? Math.min(Math.max(X(ts(hp[0])) - 80, 0), w - 190) : 0;
  const xLabel = (t: number) => {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (spanDays > 1500) return String(new Date(t).getUTCFullYear());
    if (spanDays < 120) return new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ts(iso)));
    return fmtDate(iso);
  };

  return (
    <div ref={box}>
      {hasData && (
        <div className="chart-tools">
          {data.length > 1 && <div className="legend">{data.map((s) => <span key={s.name}><i className="swatch" style={{ background: s.color }} />{s.name}</span>)}</div>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {allowLog && <button className={`btn ${log ? "on" : ""}`} onClick={() => setLog(!log)}>{labels.logScale}</button>}
            <button className={`btn ${showTable ? "on" : ""}`} onClick={() => setShowTable(!showTable)}>{showTable ? labels.chart : labels.table}</button>
          </span>
        </div>
      )}
      {!hasData ? (
        <div className="empty" style={{ height }}>{labels.noData}</div>
      ) : showTable ? (
        <div className="tbl-wrap" style={{ maxHeight: height + 40, overflowY: "auto" }}>
          <table>
            <thead><tr><th>{labels.date}</th>{data.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody>{[...base].reverse().slice(0, 500).map((p) => (
              <tr key={p[0]}><td>{fmtDate(p[0], true)}</td>{data.map((s) => { const v = valueAt(s.pts, p[0]); return <td key={s.name}>{v == null ? "—" : fmt(v)}</td>; })}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart">
          <svg viewBox={`0 0 ${w} ${height}`} height={height} role="img" aria-label={series.map((s) => s.name).join(", ")}>
            <g className="axis">
              {yt.map((v) => (
                <g key={v}><line className="gridline" x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} />
                  <text x={padL - 10} y={Y(v) + 4} textAnchor="end">{fmtAxis(v)}</text></g>
              ))}
              {rt.map((v) => <text key={`r${v}`} x={w - padR + 8} y={YR(v) + 4} textAnchor="start">{fmtAxis(v)}</text>)}
              {xt.map((t, i) => <text key={t} x={X(t)} y={height - 6} textAnchor={i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"}>{xLabel(t)}</text>)}
            </g>
            {data.map((s) => bars ? (
              <g key={s.name}>{s.pts.map((p) => {
                const v = cap(p[1]), y = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0)), cut = v < p[1];
                return <g key={p[0]}>{cut && <path d={`M${X(ts(p[0])) - bw / 2},${y + 6}l${bw},-5M${X(ts(p[0])) - bw / 2},${y + 11}l${bw},-5`} stroke="var(--surface)" strokeWidth={2} />}<rect x={X(ts(p[0])) - bw / 2} y={v >= 0 ? y : Y(0)} width={bw} height={Math.max(1, h)} rx={2} fill={s.color} opacity={hp && hp[0] !== p[0] ? .55 : 1} />{cut && <text x={X(ts(p[0]))} y={padT + 10} textAnchor="middle" fontSize={11} fill="var(--text-2)">↑</text>}</g>;
              })}</g>
            ) : s.pts.length === 1 ? (
              <circle key={s.name} cx={X(ts(s.pts[0][0]))} cy={Ys(s)(s.pts[0][1])} r={4} fill={s.color} />
            ) : (
              <g key={s.name}>
                {area && <path d={`M${X(ts(s.pts[0][0]))},${Y(ylo)}` + s.pts.map((p) => `L${X(ts(p[0])).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("") + `L${X(ts(s.pts.at(-1)![0]))},${Y(ylo)}Z`} fill="var(--area)" />}
                <path d={s.pts.map((p, i) => `${i ? "L" : "M"}${X(ts(p[0])).toFixed(1)},${Ys(s)(p[1]).toFixed(1)}`).join("")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? "5 4" : undefined} />
              </g>
            ))}
            {hp && !bars && (
              <g>
                <line x1={X(ts(hp[0]))} x2={X(ts(hp[0]))} y1={padT} y2={padT + ih} stroke="var(--text-3)" strokeDasharray="3 3" />
                {data.map((s) => { const v = valueAt(s.pts, hp[0]); return v == null ? null : <circle key={s.name} cx={X(ts(hp[0]))} cy={Ys(s)(v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />; })}
              </g>
            )}
            <rect x={padL} y={padT} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {hp && (
            <div className="tip" style={{ left: tipLeft, top: 0 }}>
              <div className="muted" style={{ fontSize: 12 }}>{fmtDate(hp[0], true)}</div>
              {data.map((s) => { const v = valueAt(s.pts, hp[0]); return (
                <div key={s.name}>{data.length > 1 && <i className="swatch" style={{ background: s.color }} />}<b>{v == null ? "—" : fmt(v)}</b> {data.length > 1 ? s.name : unit ?? ""}</div>); })}
              {gap && (() => { const a = valueAt(data[gap.a]?.pts ?? [], hp[0]), b = valueAt(data[gap.b]?.pts ?? [], hp[0]);
                return a && b ? <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 4 }}>{gap.label}: <b>{new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format((b / a - 1) * 100)}%</b></div> : null; })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
