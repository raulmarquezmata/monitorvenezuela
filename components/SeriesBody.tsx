"use client";
import { useMoney } from "./Currency";
import LineChart from "./LineChart";

type Point = [string, number];

/** Valor actual + gráfico de una serie; respeta la moneda global (Bs o US$). */
export default function SeriesBody({ name, points, unitEs, unit, decimals, lang, height, allowLog, bars, area, labels }: {
  name: string; points: Point[]; unitEs: string | null; unit: string; decimals: number; lang: "es" | "en"; height: number;
  allowLog: boolean; bars: boolean; area: boolean; labels: { logScale: string; table: string; chart: string; date: string; noData: string };
}) {
  const m = useMoney(points, unitEs, unit, lang);
  const last = m.points.at(-1);
  const dec = m.converted ? 1 : Math.min(decimals, 2);
  const nf = (v: number) => new Intl.NumberFormat(lang === "es" ? "es-VE" : "en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  return (
    <>
      <div className="big" style={{ fontSize: 34, margin: "12px 0 4px" }}>{last ? nf(last[1]) : "—"}<small>{m.unit}</small></div>
      {m.converted && <div className="muted" style={{ fontSize: 13 }}>{m.note}</div>}
      <LineChart series={[{ name, points: m.points }]} lang={lang} unit={m.unit} decimals={m.converted ? 1 : decimals}
        height={height} allowLog={allowLog} bars={bars} area={area} labels={labels} />
    </>
  );
}
