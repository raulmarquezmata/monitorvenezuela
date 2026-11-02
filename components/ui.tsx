import Link from "next/link";
import type { Latest, Point } from "@/lib/data";
import { num, fmtDateFor } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { KpiCard, type Extra, type KpiMeta } from "./Kpi";
import { defaultPeriods } from "@/lib/stats";
import { CardControls, CardScope } from "./CardScope";
import { isBsUnit } from "@/lib/money";
import SeriesBody from "./SeriesBody";
import type { Period } from "@/lib/stats";
import type { Range } from "./Range";

export function chartLabels(lang: Lang) {
  const d = t(lang);
  return { logScale: d.logScale, table: d.table, chart: d.chart, date: d.date, noData: d.noData };
}

export function kpiMeta(s: Latest, lang: Lang, href?: string): KpiMeta {
  return { code: s.code, name: lang === "es" ? s.name_es : s.name_en, unit: (lang === "es" ? s.unit_es : s.unit_en) ?? "",
    decimals: Math.min(s.decimals, 2), frequency: s.frequency, pctUnit: s.unit_es === "%", href, unitEs: s.unit_es };
}

export function Kpi({ s, points, lang, href, periods, extra, name }: { s?: Latest; points: Point[]; lang: Lang; href?: string; periods?: Period[]; extra?: Extra[]; name?: string }) {
  if (!s) return null;
  const d = t(lang);
  const m = kpiMeta(s, lang, href);
  return <KpiCard m={name ? { ...m, name } : m} points={points} lang={lang} noData={d.noData} rangeLabels={d.range} periods={periods} extra={extra} />;
}

/** Rango inicial según la frecuencia: diarias 3M, semanales y mensuales 1A, trimestrales y anuales todo. */
export const initialRange = (freq: string | null): Range => (freq === "D" ? "3M" : freq === "W" || freq === "M" ? "1A" : "MAX");

export function SectionHead({ label, href, more }: { label: string; href?: string; more?: string }) {
  return (
    <div className="section-head">
      <span className="label">{label}</span>
      {href && more && <Link href={href} className="more">{more} →</Link>}
    </div>
  );
}

/** Tarjeta de serie: nombre, último valor, gráfico (rango global), fuente y descarga. */
export function SeriesCard({ s, points, lang, allowLog = false, bars = false, area = false, height = 220, ranges, initial, stats = true, logDefault = false, note, hiLo = false }: {
  s: Latest; points: Point[]; lang: Lang; allowLog?: boolean; bars?: boolean; area?: boolean; height?: number;
  ranges?: Range[]; initial?: Range; stats?: boolean; logDefault?: boolean; note?: string; hiLo?: boolean;
}) {
  const d = t(lang);
  const unit = lang === "es" ? s.unit_es : s.unit_en;
  return (
    <div className="card" id={s.code}>
      <CardScope initial={initial ?? initialRange(s.frequency)}>
      <div className="card-top"><h3>{lang === "es" ? s.name_es : s.name_en}</h3>
        <span className="date">{s.last_date ? fmtDateFor(s.last_date, s.frequency, lang) : ""}</span></div>
      <CardControls lang={lang} money={isBsUnit(s.unit_es)} ranges={ranges} rangeLabels={d.range} />
      <SeriesBody name={lang === "es" ? s.name_es : s.name_en} points={points} unitEs={s.unit_es} unit={unit ?? ""} decimals={s.decimals}
        lang={lang} height={height} allowLog={allowLog} bars={bars} area={area} logDefault={logDefault} hiLo={hiLo}
        stats={stats && points.length > 2 ? { periods: defaultPeriods(s.frequency), pctUnit: s.unit_es === "%" } : undefined}
        labels={{ ...chartLabels(lang), noData: s.method !== "auto" ? `${d.noData} · ${d.method[s.method]}` : d.noData }} />
      {note && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{note}</p>}
      </CardScope>
      <div className="src">
        <span>{d.source}: {s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">{s.source}</a> : s.source}
          {points.length > 0 && <> · {lang === "es" ? "serie" : "series"} {fmtDateFor(points[0][0], s.frequency, lang)} – {fmtDateFor(points[points.length - 1][0], s.frequency, lang)}</>}</span>
        {s.method !== "auto" && <span className={`method ${s.method}`}>{d.method[s.method]}</span>}
        {points.length > 0 && <a className="dl" href={`/api/export?codes=${s.code}&format=xlsx&lang=${lang}`}>⬇ Excel</a>}
      </div>
    </div>
  );
}

export function BarList({ items, lang, alt = false, decimals = 0, suffix = "" }: {
  items: { name: string; value: number }[]; lang: Lang; alt?: boolean; decimals?: number; suffix?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <div className="empty">{t(lang).noData}</div>;
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={i.name} title={`${i.name}: ${num(i.value, lang, decimals)}${suffix}`}>
          <span className="name">{i.name}</span>
          <div className="bar-track"><div className={`bar-fill ${alt ? "alt" : ""}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
          <span className="v">{num(i.value, lang, decimals)}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="notice">
      Falta configurar <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en Vercel
      (Settings → Environment Variables) y volver a desplegar.
    </div>
  );
}
