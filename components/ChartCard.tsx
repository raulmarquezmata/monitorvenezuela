"use client";
import { CardControls, CardScope } from "./CardScope";
import { Stats } from "./Kpi";
import LineChart from "./LineChart";
import type { Range } from "./Range";
import type { Period } from "@/lib/stats";

type Point = [string, number];
type Labels = { logScale: string; table: string; chart: string; date: string; noData: string };

/** Tarjeta con gráfico de una o varias series y sus propios controles de rango. */
export default function ChartCard({ title, date, series, lang, unit, decimals = 2, height = 260, allowLog = false, logDefault = false, area = false, bars = false,
  ranges, initial = "1A", labels, rangeLabels, stats, children, footer }: {
  title: string; date?: string; series: { name: string; points: Point[]; color?: string }[]; lang: "es" | "en"; unit?: string; decimals?: number;
  height?: number; allowLog?: boolean; logDefault?: boolean; area?: boolean; bars?: boolean; ranges?: Range[]; initial?: Range;
  labels: Labels; rangeLabels: Record<string, string>; stats?: { periods: Period[]; pctUnit?: boolean; points?: Point[] };
  children?: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="card">
      <CardScope initial={initial}>
        <div className="card-top"><h3>{title}</h3>{date && <span className="date">{date}</span>}</div>
        {children}
        {stats && <Stats points={stats.points ?? series[0]?.points ?? []} periods={stats.periods} pctUnit={!!stats.pctUnit} lang={lang} />}
        <CardControls lang={lang} ranges={ranges} rangeLabels={rangeLabels} />
        <LineChart series={series} lang={lang} unit={unit} decimals={decimals} height={height} allowLog={allowLog} logDefault={logDefault}
          area={area} bars={bars} labels={labels} />
        {footer}
      </CardScope>
    </div>
  );
}
