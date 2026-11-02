"use client";
import { useMemo, useState } from "react";
import { CardControls, CardScope } from "./CardScope";
import LineChart from "./LineChart";

type Row = { period: string; bank: string; metric: string; value: number };
type Labels = { logScale: string; table: string; chart: string; date: string; noData: string };

const IND: { k: string; es: string; en: string; ratio?: [string, string] }[] = [
  { k: "depositos", es: "Depósitos", en: "Deposits" },
  { k: "creditos", es: "Créditos", en: "Loans" },
  { k: "depositos_en_divisas", es: "Depósitos en divisas", en: "FX deposits" },
  { k: "patrimonio", es: "Patrimonio", en: "Equity" },
  { k: "resultado_neto", es: "Resultado neto", en: "Net income" },
  { k: "margen_de_intermediacion", es: "Margen de intermediación", en: "Net interest margin" },
  { k: "valoracion_de_mercado", es: "Valoración de mercado", en: "Market value" },
  { k: "intermediacion", es: "Intermediación (créditos ÷ depósitos)", en: "Loan-to-deposit ratio", ratio: ["creditos", "depositos"] },
  { k: "divisas_share", es: "Depósitos en divisas (% del total)", en: "FX deposits (% of total)", ratio: ["depositos_en_divisas", "depositos"] },
];

const SYS_LABEL: Record<string, { es: string; en: string }> = {
  captaciones: { es: "Captaciones (depósitos)", en: "Deposits" }, creditos: { es: "Cartera de créditos", en: "Loans" },
  activos: { es: "Activos", en: "Assets" }, patrimonio: { es: "Patrimonio", en: "Equity" }, resultados: { es: "Resultado neto", en: "Net income" },
  utilidades: { es: "Utilidades", en: "Profits" }, inversiones: { es: "Inversiones", en: "Investments" }, disponibilidades: { es: "Disponibilidades", en: "Cash" },
  cartera_de_creditos_bruta: { es: "Cartera bruta", en: "Gross loans" }, depositos_a_la_vista: { es: "Depósitos a la vista", en: "Demand deposits" },
  depositos_en_moneda_extranjera: { es: "Depósitos en divisas", en: "FX deposits" },
};

/** Explorador de bancos: muestra de 6 bancos (7 indicadores) o todo el sistema (todas las tablas disponibles). */
export default function BankExplorer({ rows: sampleRows, system: system0 = [], fx = [], lang, labels, rangeLabels }: {
  rows: Row[]; system?: Row[]; fx?: [string, number][]; lang: "es" | "en"; labels: Labels; rangeLabels: Record<string, string>;
}) {
  const system = useMemo(() => system0.filter((r) => !r.metric.startsWith("muestra_")), [system0]);
  const es = lang === "es";
  const [universe, setUniverse] = useState<"sample" | "system">("sample");
  // todo el sistema → mismo formato que la muestra (millones Bs y millones US$ al oficial del cierre de mes)
  const rows = useMemo(() => {
    if (universe === "sample") return sampleRows;
    const rate = (per: string) => { let v: number | null = null; for (const [d, x] of fx) { if (d <= per) v = x; else break; } return v; };
    const out: Row[] = [];
    for (const r of system) {
      if (/^total/i.test(r.bank.replace(/\s/g, ""))) continue;
      const per = r.period.slice(0, 7) + "-01";
      out.push({ period: per, bank: r.bank, metric: `muestra_${r.metric}_bs`, value: r.value });
      const k = rate(r.period);
      if (k) out.push({ period: per, bank: r.bank, metric: `muestra_${r.metric}_usd`, value: r.value / k });
    }
    return out;
  }, [universe, sampleRows, system, fx]);
  const sysInds = useMemo(() => Array.from(new Set(system.map((r) => r.metric))).map((k) => ({ k, es: SYS_LABEL[k]?.es ?? k, en: SYS_LABEL[k]?.en ?? k }) as typeof IND[number])
    .concat(system.some((r) => r.metric === "creditos") && system.some((r) => r.metric === "captaciones") ? [{ k: "intermediacion_sys", es: "Intermediación (créditos ÷ captaciones)", en: "Loan-to-deposit ratio", ratio: ["creditos", "captaciones"] }] : []), [system]);
  const inds = universe === "sample" ? IND : sysInds;
  const [indSel, setInd] = useState("depositos");
  const ind = inds.some((x) => x.k === indSel) ? indSel : inds[0]?.k ?? "depositos";
  const [cur, setCur] = useState<"usd" | "bs">("usd");
  const meta = inds.find((x) => x.k === ind) ?? IND[0];
  const isRatio = !!meta.ratio;

  // serie[banco][periodo] del indicador elegido (o razón entre dos indicadores, siempre en %)
  const data = useMemo(() => {
    const get = (k: string, c: string) => {
      const m: Record<string, Record<string, number>> = {};
      for (const r of rows) if (r.metric === `muestra_${k}_${c}`) (m[r.bank] ??= {})[r.period] = r.value;
      return m;
    };
    if (meta.ratio) {
      const a = get(meta.ratio[0], "usd"), b = get(meta.ratio[1], "usd");
      const out: Record<string, Record<string, number>> = {};
      for (const bank of Object.keys(a)) for (const p of Object.keys(a[bank])) if (b[bank]?.[p]) (out[bank] ??= {})[p] = (a[bank][p] / b[bank][p]) * 100;
      return out;
    }
    return get(ind, cur);
  }, [rows, ind, cur, meta]);

  const banks = Object.keys(data).sort();
  const periods = Array.from(new Set(banks.flatMap((b) => Object.keys(data[b])))).sort();
  const [period, setPeriod] = useState<string>("");
  const per = period && periods.includes(period) ? period : periods.at(-1) ?? "";
  const [bank, setBank] = useState<string>("__all");

  const shift = (p: string, months: number) => { const d = new Date(`${p}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 7) + "-01"; };
  const decY = per ? `${Number(per.slice(0, 4)) - 1}-12-01` : "";
  const ch = (v?: number, ref?: number) => (v == null || ref == null || !ref ? null : isRatio ? v - ref : (v / ref - 1) * 100);
  const total = (p: string) => isRatio ? null : banks.reduce((a, b) => a + (data[b][p] ?? 0), 0);
  const table = banks.map((b) => {
    const v = data[b][per];
    return { bank: b, v, mom: ch(v, data[b][shift(per, -1)]), ytd: ch(v, data[b][decY]), yoy: ch(v, data[b][shift(per, -12)]), share: !isRatio && v != null ? (v / (total(per) || 1)) * 100 : null };
  }).sort((x, y) => (y.v ?? -1e18) - (x.v ?? -1e18));
  const tot = total(per);
  const totRow = tot == null ? null : { v: tot, mom: ch(tot, total(shift(per, -1)) || undefined), ytd: ch(tot, total(decY) || undefined), yoy: ch(tot, total(shift(per, -12)) || undefined) };

  const shown = bank === "__all" ? (universe === "system" ? table.slice(0, 8).map((r) => r.bank) : banks) : [bank];
  const series = shown.map((b) => ({ name: b, points: periods.filter((p) => data[b][p] != null).map((p) => [p, data[b][p]] as [string, number]) }));
  const unit = isRatio ? "%" : cur === "usd" ? (es ? "millones US$" : "US$ million") : (es ? "millones Bs" : "Bs million");
  const loc = es ? "es-VE" : "en-US";
  const nf = (v: number | null | undefined, d = 1) => v == null ? "—" : new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const pc = (v: number | null) => <td className={v == null ? "" : v >= 0 ? "up" : "down"}>{v == null ? "—" : `${v > 0 ? "+" : ""}${nf(v)}${isRatio ? " pp" : "%"}`}</td>;
  const mName = (p: string) => new Intl.DateTimeFormat(loc, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${p}T12:00:00Z`));

  if (!rows.length) return <div className="empty">{labels.noData}</div>;
  return (
    <div className="card">
      <div className="card-top"><h3>{es ? "Bancos" : "Banks"}</h3><span className="date">{per ? mName(per) : ""}</span></div>
      {system.length > 0 && (
        <div className="seg" style={{ marginTop: 12 }}>
          <button className={universe === "sample" ? "on" : ""} onClick={() => setUniverse("sample")}>{es ? "Muestra (6 bancos, 7 indicadores)" : "Sample (6 banks)"}</button>
          <button className={universe === "system" ? "on" : ""} onClick={() => setUniverse("system")}>{es ? `Todo el sistema (${new Set(system.filter((r) => !/^total/i.test(r.bank.replace(/\s/g, ""))).map((r) => r.bank)).size} bancos)` : "Whole system"}</button>
        </div>
      )}
      <div className="form" style={{ marginTop: 12 }}>
        <label>{es ? "Indicador" : "Indicator"}<select value={ind} onChange={(e) => setInd(e.target.value)}>{inds.map((x) => <option key={x.k} value={x.k}>{x[lang]}</option>)}</select></label>
        {!isRatio && <label>{es ? "Moneda" : "Currency"}<select value={cur} onChange={(e) => setCur(e.target.value as never)}><option value="usd">US$</option><option value="bs">Bs</option></select></label>}
        <label>{es ? "Mes" : "Month"}<select value={per} onChange={(e) => setPeriod(e.target.value)}>{periods.slice().reverse().map((p) => <option key={p} value={p}>{mName(p)}</option>)}</select></label>
      </div>
      <div className="tbl-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>{es ? "Banco" : "Bank"}</th><th>{unit}</th><th>{es ? "Mes ant." : "MoM"}</th><th>{es ? "En el año" : "YTD"}</th><th>{es ? "Interanual" : "YoY"}</th>{!isRatio && <th>{universe === "sample" ? (es ? "% muestra" : "% sample") : (es ? "% sistema" : "% system")}</th>}</tr></thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.bank} onClick={() => setBank(r.bank === bank ? "__all" : r.bank)} style={{ cursor: "pointer", fontWeight: r.bank === bank ? 600 : undefined }}>
                <td>{r.bank}</td><td>{nf(r.v, isRatio ? 1 : 1)}</td>{pc(r.mom)}{pc(r.ytd)}{pc(r.yoy)}{!isRatio && <td>{nf(r.share)}%</td>}
              </tr>
            ))}
            {totRow && <tr style={{ fontWeight: 600 }}><td>{universe === "sample" ? (es ? "Total muestra" : "Sample total") : (es ? "Total" : "Total")}</td><td>{nf(totRow.v)}</td>{pc(totRow.mom)}{pc(totRow.ytd)}{pc(totRow.yoy)}<td>100%</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{es ? `Toca un banco para ver solo su evolución; tócalo de nuevo para ver ${universe === "system" ? "los 8 más grandes" : "todos"}.` : "Tap a bank to chart it alone; tap again for all."}</p>
      <CardScope initial="MAX">
        <CardControls lang={lang} ranges={["YTD", "1A", "MAX"]} rangeLabels={rangeLabels} />
        <LineChart lang={lang} series={series} unit={unit} decimals={1} height={300} labels={labels} minPoints={3} />
      </CardScope>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{es
        ? (universe === "sample" ? "Fuente: balances mensuales de publicación de cada banco (archivo propio)." : "Fuente: SUDEBAN, balances de publicación (vía Finanzas Digital); se actualiza solo cuando salen, alrededor del 15 de cada mes.") + ` Montos en US$ al tipo de cambio oficial de cada cierre de mes. Serie: ${periods[0] ? mName(periods[0]) : "—"} – ${per ? mName(per) : "—"}.`
        : "Source: each bank's monthly published balance sheets (own file). US$ amounts at each month-end official rate."}</p>
    </div>
  );
}
