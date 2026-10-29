"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import LineChart from "./LineChart";

type Meta = { code: string; name: string; unit: string; category: string; catName: string };
type Point = [string, number];
type Mode = "base100" | "level";
const SPANS: Record<string, number> = { "1A": 1, "3A": 3, "5A": 5, "10A": 10 };

export default function Comparator({ series, lang, labels, initial }: {
  series: Meta[]; lang: "es" | "en"; initial: string[];
  labels: { add: string; base100: string; level: string; sameUnit: string; hint: string; remove: string; download: string; chart: Record<string, unknown> };
}) {
  const [sel, setSel] = useState<string[]>(initial);
  const [data, setData] = useState<Record<string, Point[]>>({});
  const [mode, setMode] = useState<Mode>("base100");
  const [span, setSpan] = useState("3A");
  const [loading, setLoading] = useState(false);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const missing = sel.filter((c) => !data[c] && !requested.current.has(c));
    if (!missing.length) return;
    missing.forEach((c) => requested.current.add(c));
    setLoading(true);
    fetch(`/api/series?codes=${missing.join(",")}`).then((r) => r.json()).then((j) => setData((d) => ({ ...d, ...j })))
      .catch(() => missing.forEach((c) => requested.current.delete(c))).finally(() => setLoading(false));
  }, [sel, data]);

  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("s", sel.join(","));
    window.history.replaceState(null, "", u.toString());
  }, [sel]);

  const units = new Set(sel.map((c) => series.find((s) => s.code === c)?.unit));
  const levelOk = units.size <= 1;
  const effMode: Mode = mode === "level" && !levelOk ? "base100" : mode;

  const chartSeries = useMemo(() => {
    const cut = new Date(); cut.setFullYear(cut.getFullYear() - SPANS[span]);
    const c = cut.toISOString().slice(0, 10);
    return sel.map((code) => {
      const m = series.find((s) => s.code === code)!;
      let pts = (data[code] ?? []).filter((p) => p[0] >= c);
      if (effMode === "base100" && pts.length) { const b = pts[0][1]; pts = b ? pts.map(([d, v]) => [d, (v / b) * 100] as Point) : []; }
      return { name: m?.name ?? code, points: pts };
    });
  }, [sel, data, span, effMode, series]);

  const groups = useMemo(() => {
    const g = new Map<string, Meta[]>();
    for (const s of series) { if (!g.has(s.catName)) g.set(s.catName, []); g.get(s.catName)!.push(s); }
    return [...g.entries()];
  }, [series]);

  return (
    <div>
      <div className="chart-tools" style={{ gap: 8 }}>
        <select value="" onChange={(e) => { if (e.target.value && sel.length < 4 && !sel.includes(e.target.value)) setSel([...sel, e.target.value]); }} disabled={sel.length >= 4}>
          <option value="">{labels.add}</option>
          {groups.map(([cat, items]) => (
            <optgroup key={cat} label={cat}>{items.map((s) => <option key={s.code} value={s.code} disabled={sel.includes(s.code)}>{s.name}</option>)}</optgroup>
          ))}
        </select>
        <div className="seg">
          <button className={effMode === "base100" ? "on" : ""} onClick={() => setMode("base100")}>{labels.base100}</button>
          <button className={effMode === "level" ? "on" : ""} onClick={() => setMode("level")} disabled={!levelOk} title={levelOk ? "" : labels.sameUnit}>{labels.level}</button>
        </div>
        <div className="seg">{Object.keys(SPANS).map((k) => <button key={k} className={k === span ? "on" : ""} onClick={() => setSpan(k)}>{lang === "en" ? k.replace("A", "Y") : k}</button>)}</div>
        {sel.length > 0 && <a className="btn" href={`/api/export?codes=${sel.join(",")}&format=xlsx&lang=${lang}`}>⬇ {labels.download}</a>}
        {loading && <span className="muted">…</span>}
      </div>
      <div className="chips">
        {sel.map((c) => <a key={c} href="#" onClick={(e) => { e.preventDefault(); setSel(sel.filter((x) => x !== c)); }} className="on" title={labels.remove}>{series.find((s) => s.code === c)?.name ?? c} ✕</a>)}
      </div>
      {sel.length ? (
        <LineChart lang={lang} decimals={2} height={360} ignoreRange labels={labels.chart as never}
          unit={effMode === "base100" ? "base 100" : [...units][0] ?? ""} series={chartSeries} />
      ) : <div className="empty" style={{ height: 300 }}>{labels.hint}</div>}
      <p className="muted" style={{ marginTop: 8 }}>{effMode === "base100" ? labels.hint : labels.sameUnit}</p>
    </div>
  );
}
