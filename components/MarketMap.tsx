"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type MapRow = { t: string; n: string; s: string; se: string; i?: string; w: number; p: number; d: number | null; wk: number | null; m: number | null; y: number | null; sp?: number[] };
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
// escala de 7 colores al estilo de los mapas de mercado (rojo intenso ← gris → verde intenso)
const STOPS = ["#f63538", "#bf4045", "#8b444e", "#414554", "#35764e", "#2f9e4f", "#30cc5a"];
function color(v: number | null, per: Per) {
  if (v == null) return "#414554";
  const k = Math.max(-1, Math.min(1, v / LIM[per])) * 3 + 3; // 0..6
  const a = Math.floor(k), b = Math.min(6, a + 1), t = k - a;
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [hex(STOPS[a]), hex(STOPS[b])];
  return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * t)).join(",")})`;
}

type Tile = MapRow & Box & { v: number };
type Ind = { name: string; sector: string; x: number; y: number; w: number; h: number; head: number; tiles: Tile[] };

function Spark({ pts, up }: { pts?: number[]; up: boolean }) {
  if (!pts || pts.length < 2) return <span style={{ width: 70 }} />;
  const lo = Math.min(...pts), hi = Math.max(...pts), W = 70, H = 20;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo || 1)) * H).toFixed(1)}`).join("");
  return <svg width={W} height={H}><path d={d} fill="none" stroke={up ? "#30cc5a" : "#f63538"} strokeWidth={1.3} /></svg>;
}

/** Mapa del S&P 500 por sector e industria (tamaño = peso en el índice; color = rendimiento del período), al estilo de Finviz. */
export default function MarketMap({ rows, lang }: { rows: MapRow[]; lang: "es" | "en" }) {
  const es = lang === "es";
  const [per, setPer] = useState<Per>("d");
  const [hover, setHover] = useState<{ t: Tile; ind: Ind; mx: number; my: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1100);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = Math.round(W < 700 ? W * 1.4 : W * 0.6);
  const loc = es ? "es-VE" : "en-US";
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${new Intl.NumberFormat(loc, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}%`);
  const money = (v: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const layout = useMemo(() => {
    const secName = (r: MapRow) => (es ? r.se : r.s);
    const bySec = new Map<string, MapRow[]>();
    for (const r of rows) bySec.set(secName(r), [...(bySec.get(secName(r)) ?? []), r]);
    const secs = squarify([...bySec.entries()].map(([name, rs]) => ({ name, rs, v: rs.reduce((a, r) => a + r.w, 0) })), { x: 0, y: 0, w: W, h: H });
    return secs.map((s) => {
      const sh = s.h > 30 && s.w > 50 ? 17 : 0; // franja con el nombre del sector
      const byInd = new Map<string, MapRow[]>();
      for (const r of s.rs) byInd.set(r.i || r.s, [...(byInd.get(r.i || r.s) ?? []), r]);
      const inds = squarify([...byInd.entries()].map(([name, rs]) => ({ name, rs, v: rs.reduce((a, r) => a + r.w, 0) })),
        { x: s.x + 1, y: s.y + sh, w: s.w - 2, h: s.h - sh - 1 }).map((g) => {
        const head = g.h > 46 && g.w > 70 ? 13 : 0; // franja con el nombre de la industria
        const tiles = squarify(g.rs.map((r) => ({ ...r, v: r.w })), { x: g.x + 1, y: g.y + head + 1, w: g.w - 2, h: g.h - head - 2 }) as Tile[];
        return { name: g.name, sector: s.name, x: g.x, y: g.y, w: g.w, h: g.h, head, tiles } as Ind;
      });
      return { ...s, sh, inds };
    });
  }, [rows, W, H, es]);
  const P: [Per, string][] = [["d", es ? "Día" : "Day"], ["wk", es ? "Semana" : "Week"], ["m", es ? "Mes" : "Month"], ["y", es ? "Año" : "YTD"]];
  // panel lateral: a la derecha del cursor si hay espacio, si no a la izquierda
  const PW = Math.min(380, W - 20);
  const panelLeft = hover ? (hover.mx + 20 + PW < W ? hover.mx + 20 : Math.max(0, hover.mx - PW - 20)) : 0;
  const peers = hover ? [...hover.ind.tiles].sort((a, b) => b.w - a.w).filter((t) => t.t !== hover.t.t).slice(0, 14) : [];
  return (
    <div>
      <div className="card-controls" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="ranges" role="group">{P.map(([k, l]) => <button key={k} className={per === k ? "on" : ""} onClick={() => setPer(k)}>{l}</button>)}</div>
        <div className="map-legend">{[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((k) => <span key={k} style={{ background: color(k * LIM[per], per) }}>{k === 0 ? "0%" : `${k > 0 ? "+" : ""}${Math.round(k * LIM[per])}%`}</span>)}</div>
      </div>
      <div ref={ref} className="market-map" style={{ position: "relative", marginTop: 10 }} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? "Mapa del S&P 500" : "S&P 500 map"}
          onMouseMove={(e) => { if (!hover) return; const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover({ ...hover, mx: e.clientX - b.left, my: e.clientY - b.top }); }}>
          <rect width={W} height={H} fill="#262931" />
          {layout.map((s) => (
            <g key={s.name}>
              {s.sh > 0 && <text x={s.x + 4} y={s.y + 13} fontSize={12.5} fontWeight={700} fill="#ffffff" letterSpacing={0.3}>{s.name.toUpperCase()}</text>}
              {s.inds.map((g) => (
                <g key={g.name}>
                  {g.head > 0 && <><rect x={g.x} y={g.y} width={g.w} height={g.head} fill="#3a3e48" />
                    <text x={g.x + 3} y={g.y + 10} fontSize={9} fontWeight={600} fill="#c9ccd4">{(g.name.length * 5.2 > g.w ? g.name.slice(0, Math.max(3, Math.floor(g.w / 5.4))) : g.name).toUpperCase()}</text></>}
                  {g.tiles.map((t) => {
                    const v = t[per];
                    const fs = Math.min(44, t.h / 2.3, (t.w - 4) / (t.t.length * 0.62));
                    const show = fs >= 7.5;
                    const two = show && t.h > fs * 2.3;
                    return (
                      <g key={t.t} onMouseEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ t, ind: g, mx: e.clientX - b.left, my: e.clientY - b.top }); }}>
                        <rect x={t.x} y={t.y} width={Math.max(0, t.w - 1)} height={Math.max(0, t.h - 1)} fill={color(v, per)} />
                        {show && <text x={t.x + t.w / 2} y={t.y + t.h / 2 + (two ? -fs * 0.05 : fs * 0.35)} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#fff">{t.t}</text>}
                        {two && <text x={t.x + t.w / 2} y={t.y + t.h / 2 + fs * 0.75} textAnchor="middle" fontSize={Math.max(7, fs * 0.5)} fill="#fff">{pct(v)}</text>}
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
          ))}
          {hover && <rect x={hover.ind.x} y={hover.ind.y} width={hover.ind.w} height={hover.ind.h} fill="none" stroke="#ffd400" strokeWidth={2.5} pointerEvents="none" />}
        </svg>
        {hover && (
          <div className="map-panel" style={{ left: panelLeft, top: Math.min(Math.max(0, hover.my - 60), Math.max(0, H - 360)), width: PW }}>
            <div className="mp-head">{hover.ind.sector} · {hover.ind.name}</div>
            <div className="mp-main">
              <div><b>{hover.t.t}</b><div className="mp-name">{hover.t.n}</div></div>
              <Spark pts={hover.t.sp} up={(hover.t[per] ?? 0) >= 0} />
              <span className="mp-price">{money(hover.t.p)}</span>
              <span className={(hover.t[per] ?? 0) >= 0 ? "mp-up" : "mp-dn"}>{pct(hover.t[per])}</span>
            </div>
            {peers.map((t) => (
              <div key={t.t} className="mp-row">
                <b>{t.t}</b><Spark pts={t.sp} up={(t[per] ?? 0) >= 0} /><span className="mp-price">{money(t.p)}</span>
                <span className={(t[per] ?? 0) >= 0 ? "mp-up" : "mp-dn"}>{pct(t[per])}</span>
              </div>
            ))}
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
