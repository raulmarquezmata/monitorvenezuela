"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type MapRow = { t: string; n: string; s: string; se: string; w: number; p: number; d: number | null; wk: number | null; m: number | null; y: number | null };
type Per = "d" | "wk" | "m" | "y";
type Box = { x: number; y: number; w: number; h: number };

/** Treemap «squarified» (Bruls et al.): rectángulos lo más cuadrados posible, área proporcional al peso. */
function squarify<T extends { v: number }>(items: T[], box: Box): (T & Box)[] {
  const out: (T & Box)[] = [];
  const data = items.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const total = data.reduce((a, i) => a + i.v, 0);
  if (!total || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  let rest = data.map((i) => ({ ...i, a: i.v * scale }));
  let { x, y, w, h } = box;
  const worst = (row: { a: number }[], side: number) => {
    const s = row.reduce((a, r) => a + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    rest = rest.slice(i);
    const s = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) { // columna a la izquierda
      const cw = s / h; let cy = y;
      for (const r of row) { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else { // fila arriba
      const rh = s / w; let cx = x;
      for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  }
  return out;
}

const LIM: Record<Per, number> = { d: 3, wk: 6, m: 10, y: 30 };
function color(v: number | null, per: Per) {
  if (v == null) return "#3a3f4b";
  const k = Math.max(-1, Math.min(1, v / LIM[per]));
  // rojo (#b8322a) ← gris (#414554) → verde (#2f9e5b), como los mapas de mercado
  const mix = (a: number[], b: number[], t: number) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  const g = [65, 69, 84];
  const c = k < 0 ? mix(g, [184, 50, 42], -k) : mix(g, [47, 158, 91], k);
  return `rgb(${c.join(",")})`;
}

/** Mapa del S&P 500 por sector (tamaño = peso en el índice; color = rendimiento del período). */
export default function MarketMap({ rows, lang }: { rows: MapRow[]; lang: "es" | "en" }) {
  const es = lang === "es";
  const [per, setPer] = useState<Per>("d");
  const [hover, setHover] = useState<(MapRow & Box) | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1100);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = Math.round(W < 700 ? W * 1.3 : W * 0.55);
  const loc = es ? "es-VE" : "en-US";
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${new Intl.NumberFormat(loc, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}%`);
  const layout = useMemo(() => {
    const bySec = new Map<string, MapRow[]>();
    for (const r of rows) bySec.set(es ? r.se : r.s, [...(bySec.get(es ? r.se : r.s) ?? []), r]);
    const secs = squarify([...bySec.entries()].map(([name, rs]) => ({ name, rs, v: rs.reduce((a, r) => a + r.w, 0) })), { x: 0, y: 0, w: W, h: H });
    return secs.map((s) => {
      const pad = 1, top = s.h > 40 && s.w > 60 ? 16 : 0;
      const tiles = squarify(s.rs.map((r) => ({ ...r, v: r.w })), { x: s.x + pad, y: s.y + top + pad, w: s.w - 2 * pad, h: s.h - top - 2 * pad });
      return { ...s, top, tiles };
    });
  }, [rows, W, H, es]);
  const P: [Per, string][] = [["d", es ? "Día" : "Day"], ["wk", es ? "Semana" : "Week"], ["m", es ? "Mes" : "Month"], ["y", es ? "Año" : "YTD"]];
  return (
    <div>
      <div className="card-controls" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="ranges" role="group">{P.map(([k, l]) => <button key={k} className={per === k ? "on" : ""} onClick={() => setPer(k)}>{l}</button>)}</div>
        <div className="map-legend">{[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((k) => <span key={k} style={{ background: color(k * LIM[per], per) }}>{k === 0 ? "0%" : `${k > 0 ? "+" : ""}${Math.round(k * LIM[per])}%`}</span>)}</div>
      </div>
      <div ref={ref} className="market-map" style={{ position: "relative", marginTop: 10 }} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? "Mapa del S&P 500" : "S&P 500 map"}>
          {layout.map((s) => (
            <g key={s.name}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#1b1f2a" />
              {s.top > 0 && <text x={s.x + 4} y={s.y + 12} fontSize={11} fontWeight={700} fill="#d7dae3">{s.name.toUpperCase()}</text>}
              {s.tiles.map((r) => {
                const v = r[per];
                const big = r.w > 34 && r.h > 22;
                const fs = Math.max(9, Math.min(22, Math.sqrt(r.w * r.h) / 5));
                return (
                  <g key={r.t} onMouseEnter={() => setHover(r)}>
                    <rect x={r.x} y={r.y} width={Math.max(0, r.w - 1)} height={Math.max(0, r.h - 1)} fill={color(v, per)} />
                    {big && <text x={r.x + r.w / 2} y={r.y + r.h / 2 - (r.h > fs * 2.4 ? fs * 0.25 : -fs * 0.35)} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#fff">{r.t}</text>}
                    {big && r.h > fs * 2.4 && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + fs * 0.85} textAnchor="middle" fontSize={fs * 0.7} fill="#fff">{pct(v)}</text>}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {hover && (
          <div className="tip" style={{ left: Math.min(Math.max(hover.x + hover.w / 2 - 110, 0), W - 230), top: Math.min(hover.y + hover.h, H - 90) }}>
            <b>{hover.t}</b> · {hover.n}<div className="muted" style={{ fontSize: 12 }}>{es ? hover.se : hover.s} · {es ? "peso" : "weight"} {new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }).format(hover.w)}%</div>
            <div>US$ {new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hover.p)} · <b>{pct(hover[per])}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mayores alzas y caídas del S&P 500 en el período elegido. */
export function Movers({ rows, lang }: { rows: MapRow[]; lang: "es" | "en" }) {
  const es = lang === "es";
  const [per, setPer] = useState<Per>("d");
  const ok = rows.filter((r) => r[per] != null);
  const up = [...ok].sort((a, b) => (b[per] ?? 0) - (a[per] ?? 0)).slice(0, 5);
  const dn = [...ok].sort((a, b) => (a[per] ?? 0) - (b[per] ?? 0)).slice(0, 5);
  const loc = es ? "es-VE" : "en-US";
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${new Intl.NumberFormat(loc, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}%`);
  const P: [Per, string][] = [["d", es ? "Día" : "Day"], ["wk", es ? "Semana" : "Week"], ["m", es ? "Mes" : "Month"], ["y", es ? "Año" : "YTD"]];
  const table = (list: MapRow[], title: string) => (
    <div>
      <h4 style={{ margin: "14px 0 6px" }}>{title}</h4>
      <table className="tbl compact">
        <tbody>{list.map((r) => (
          <tr key={r.t}><td><b>{r.t}</b></td><td className="l muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.n}</td>
            <td style={{ textAlign: "right" }}>US$ {new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.p)}</td>
            <td className={(r[per] ?? 0) >= 0 ? "up" : "down"} style={{ textAlign: "right", fontWeight: 600 }}>{pct(r[per])}</td></tr>))}</tbody>
      </table>
    </div>
  );
  return (
    <div>
      <div className="ranges" role="group">{P.map(([k, l]) => <button key={k} className={per === k ? "on" : ""} onClick={() => setPer(k)}>{l}</button>)}</div>
      <div className="grid g2" style={{ gap: 20 }}>
        {table(up, es ? "Mayores alzas" : "Top gainers")}
        {table(dn, es ? "Mayores caídas" : "Top losers")}
      </div>
    </div>
  );
}
