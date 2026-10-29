"use client";
import { useMemo, useState } from "react";

type Point = [string, number];
type Props = {
  lang: "es" | "en";
  fx: { usd_bcv: Point[]; usd_paralelo: Point[]; eur_bcv: Point[] };
  inflation: Point[]; // inflación mensual %
};

const at = (pts: Point[], d: string) => { let v: number | null = null; for (const p of pts) { if (p[0] <= d) v = p[1]; else break; } return v; };

export default function Calculator({ lang, fx, inflation }: Props) {
  const es = lang === "es";
  const loc = es ? "es-VE" : "en-US";
  const f = (v: number | null | undefined, dec = 2) => v == null || !isFinite(v) ? "—" : new Intl.NumberFormat(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  const parse = (s: string) => Number(es ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")) || 0;
  const last = (pts: Point[]) => pts.at(-1);

  // ---- Conversor
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState<"USD" | "BS" | "EUR">("USD");
  const [date, setDate] = useState(last(fx.usd_bcv)?.[0] ?? "");
  const rates = { of: at(fx.usd_bcv, date), pa: at(fx.usd_paralelo, date), eu: at(fx.eur_bcv, date) };
  const a = parse(amount);
  const conv = useMemo(() => {
    const { of, pa, eu } = rates;
    if (from === "USD") return [{ k: es ? "Bs al oficial" : "Bs at official", v: of && a * of }, { k: es ? "Bs al paralelo" : "Bs at parallel", v: pa && a * pa }];
    if (from === "EUR") return [{ k: es ? "Bs al oficial (€)" : "Bs at official (€)", v: eu && a * eu }, { k: es ? "US$ (cruce oficial)" : "US$ (official cross)", v: eu && of && (a * eu) / of }];
    return [{ k: es ? "US$ al oficial" : "US$ at official", v: of && a / of }, { k: es ? "US$ al paralelo" : "US$ at parallel", v: pa && a / pa }, { k: es ? "€ al oficial" : "€ at official", v: eu && a / eu }];
  }, [a, from, rates.of, rates.pa, rates.eu, es]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Indexación por inflación
  const months = inflation.map((p) => p[0].slice(0, 7));
  const [infAmount, setInfAmount] = useState("1000");
  const [infFrom, setInfFrom] = useState(months[0] ?? "");
  const factor = useMemo(() => {
    let k = 1;
    for (const [d, v] of inflation) if (d.slice(0, 7) > infFrom) k *= 1 + v / 100;
    return k;
  }, [inflation, infFrom]);
  const lastInf = inflation.at(-1)?.[0].slice(0, 7);

  return (
    <div className="grid cards">
      <div className="card">
        <h3>{es ? "Conversor Bs / US$ / €" : "Bs / US$ / € converter"}</h3>
        <p className="muted">{es ? "Con la tasa vigente en la fecha elegida." : "Using the rate in force on the chosen date."}</p>
        <div className="form">
          <label>{es ? "Monto" : "Amount"}<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>{es ? "Moneda" : "Currency"}
            <select value={from} onChange={(e) => setFrom(e.target.value as never)}>
              <option value="USD">US$</option><option value="BS">Bs</option><option value="EUR">€</option>
            </select>
          </label>
          <label>{es ? "Fecha" : "Date"}<input type="date" value={date} max={last(fx.usd_bcv)?.[0]} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <table style={{ marginTop: 12 }}><tbody>
          {conv.map((r) => <tr key={r.k}><td>{r.k}</td><td style={{ fontWeight: 650, fontSize: 18 }}>{f(r.v as number)}</td></tr>)}
        </tbody></table>
        <p className="muted" style={{ marginTop: 8 }}>
          {es ? "Tasas" : "Rates"}: {es ? "oficial" : "official"} {f(rates.of, 4)} · {es ? "paralelo" : "parallel"} {f(rates.pa)} · € {f(rates.eu, 4)}
          {rates.of && rates.pa ? ` · ${es ? "brecha" : "gap"} ${f((rates.pa / rates.of - 1) * 100, 1)}%` : ""}
        </p>
      </div>
      <div className="card">
        <h3>{es ? "¿Cuánto valen hoy? (por inflación)" : "What is it worth today? (inflation)"}</h3>
        <p className="muted">{es ? "Actualiza un monto en Bs con la inflación acumulada del INPC." : "Updates a Bs amount with cumulative CPI inflation."}</p>
        {inflation.length ? (
          <>
            <div className="form">
              <label>{es ? "Monto en Bs" : "Amount in Bs"}<input inputMode="decimal" value={infAmount} onChange={(e) => setInfAmount(e.target.value)} /></label>
              <label>{es ? "Precio de fin de" : "Price as of end of"}
                <select value={infFrom} onChange={(e) => setInfFrom(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              </label>
            </div>
            <table style={{ marginTop: 12 }}><tbody>
              <tr><td>{es ? "Equivale a" : "Equivalent to"} ({lastInf})</td><td style={{ fontWeight: 650, fontSize: 18 }}>Bs {f(parse(infAmount) * factor)}</td></tr>
              <tr><td>{es ? "Inflación acumulada" : "Cumulative inflation"}</td><td>{f((factor - 1) * 100, 1)}%</td></tr>
            </tbody></table>
          </>
        ) : <div className="empty">{es ? "Sin datos de inflación" : "No inflation data"}</div>}
      </div>
    </div>
  );
}
