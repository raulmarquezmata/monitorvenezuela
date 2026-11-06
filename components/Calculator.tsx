"use client";
import { useMemo, useState } from "react";

type Point = [string, number];
type Props = {
  lang: "es" | "en";
  fx: { usd_bcv: Point[]; usd_paralelo: Point[]; eur_bcv: Point[] };
  inflation: Point[]; // inflación mensual %
  usCpi: Point[];     // IPC de EE.UU. (índice mensual)
};

const at = (pts: Point[], d: string) => { let v: number | null = null; for (const p of pts) { if (p[0] <= d) v = p[1]; else break; } return v; };

export default function Calculator({ lang, fx, inflation, usCpi }: Props) {
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
    if (from === "USD") return [{ k: es ? "Bs al oficial" : "Bs at official", v: of && a * of }, { k: es ? "Bs al alternativo" : "Bs at alternative", v: pa && a * pa },
      { k: es ? "€ (cruce oficial)" : "€ (official cross)", v: eu && of && (a * of) / eu }];
    if (from === "EUR") return [{ k: es ? "Bs al oficial" : "Bs at official", v: eu && a * eu }, { k: es ? "Bs al alternativo (cruce)" : "Bs at alternative (cross)", v: eu && of && pa && ((a * eu) / of) * pa },
      { k: es ? "US$ (cruce oficial)" : "US$ (official cross)", v: eu && of && (a * eu) / of }];
    return [{ k: es ? "US$ al oficial" : "US$ at official", v: of && a / of }, { k: es ? "US$ al alternativo" : "US$ at alternative", v: pa && a / pa }, { k: es ? "€ al oficial" : "€ at official", v: eu && a / eu }];
  }, [a, from, rates.of, rates.pa, rates.eu, es]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Indexación por inflación (Bs): del cierre de un mes al cierre de otro
  const months = inflation.map((p) => p[0].slice(0, 7));
  const [infAmount, setInfAmount] = useState("1000");
  const [infFrom, setInfFrom] = useState(months.at(-13) ?? months[0] ?? "");
  const [infTo, setInfTo] = useState(months.at(-1) ?? "");
  const factor = useMemo(() => {
    let k = 1;
    for (const [d, v] of inflation) { const m = d.slice(0, 7); if (m > infFrom && m <= infTo) k *= 1 + v / 100; }
    return k;
  }, [inflation, infFrom, infTo]);
  const mName = (ym: string) => ym ? new Intl.DateTimeFormat(loc, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`)) : "";
  const nextYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

  // ---- Inflación en dólares (IPC de EE.UU.)
  const usMonths = usCpi.map((p) => p[0].slice(0, 7));
  const [usAmount, setUsAmount] = useState("100");
  const [usFrom, setUsFrom] = useState(usMonths.find((m) => m >= "2021-01") ?? usMonths[0] ?? "");
  const usTo = usMonths.at(-1) ?? "";
  const usFactor = useMemo(() => {
    const a0 = usCpi.find((p) => p[0].slice(0, 7) === usFrom)?.[1], a1 = usCpi.at(-1)?.[1];
    return a0 && a1 ? a1 / a0 : null;
  }, [usCpi, usFrom]);

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
          {es ? "Tasas" : "Rates"}: {es ? "oficial" : "official"} {f(rates.of, 4)} · {es ? "alternativo" : "alternative"} {f(rates.pa)} · € {f(rates.eu, 4)}
          {rates.of && rates.pa ? ` · ${es ? "brecha" : "gap"} ${f((rates.pa / rates.of - 1) * 100, 1)}%` : ""}
        </p>
      </div>
      <div className="card">
        <h3>{es ? "Inflación en dólares" : "Dollar inflation"}</h3>
        <p className="muted">{es ? "Cuánto poder de compra pierde un monto en US$ con la inflación de EE.UU. (IPC)." : "How much purchasing power a US$ amount loses to US inflation (CPI)."}</p>
        {usCpi.length ? (
          <>
            <div className="form">
              <label>{es ? "Monto en US$" : "Amount in US$"}<input inputMode="decimal" value={usAmount} onChange={(e) => setUsAmount(e.target.value)} /></label>
              <label>{es ? "Desde" : "From"}
                <select value={usFrom} onChange={(e) => setUsFrom(e.target.value)}>{usMonths.slice().reverse().map((m) => <option key={m} value={m}>{mName(m)}</option>)}</select>
              </label>
            </div>
            <table style={{ marginTop: 12 }}><tbody>
              <tr><td>{es ? `Equivale en ${mName(usTo)} a` : `Equivalent in ${mName(usTo)} to`}</td><td style={{ fontWeight: 650, fontSize: 18 }}>US$ {f(usFactor ? parse(usAmount) * usFactor : null)}</td></tr>
              <tr><td>{es ? "Inflación acumulada en US$" : "Cumulative US$ inflation"}</td><td>{f(usFactor ? (usFactor - 1) * 100 : null, 1)}%</td></tr>
            </tbody></table>
            <p className="muted" style={{ marginTop: 8 }}>{es ? `Período: ${mName(usFrom)} → ${mName(usTo)} (último IPC publicado).` : `Period: ${mName(usFrom)} → ${mName(usTo)} (latest CPI).`}</p>
          </>
        ) : <div className="empty">{es ? "El IPC de EE.UU. se carga en la próxima corrida semanal." : "US CPI loads on the next weekly run."}</div>}
      </div>
      <div className="card">
        <h3>{es ? "Inflación en bolívares" : "Bolivar inflation"}</h3>
        <p className="muted">{es ? "Actualiza un monto en Bs con la inflación del INPC (BCV) entre dos meses." : "Updates a Bs amount with CPI inflation (BCV) between two months."}</p>
        {inflation.length ? (
          <>
            <div className="form">
              <label>{es ? "Monto en Bs" : "Amount in Bs"}<input inputMode="decimal" value={infAmount} onChange={(e) => setInfAmount(e.target.value)} /></label>
              <label>{es ? "Precio al cierre de" : "Price at end of"}
                <select value={infFrom} onChange={(e) => setInfFrom(e.target.value)}>{months.slice().reverse().map((m) => <option key={m} value={m}>{mName(m)}</option>)}</select>
              </label>
              <label>{es ? "Llevarlo al cierre de" : "Bring to end of"}
                <select value={infTo} onChange={(e) => setInfTo(e.target.value)}>{months.slice().reverse().filter((m) => m > infFrom).map((m) => <option key={m} value={m}>{mName(m)}</option>)}</select>
              </label>
            </div>
            <table style={{ marginTop: 12 }}><tbody>
              <tr><td>{es ? `Equivale al cierre de ${mName(infTo)} a` : `Equivalent at end of ${mName(infTo)} to`}</td><td style={{ fontWeight: 650, fontSize: 18 }}>Bs {f(parse(infAmount) * factor)}</td></tr>
              <tr><td>{es ? "Inflación acumulada" : "Cumulative inflation"}</td><td>{f((factor - 1) * 100, 1)}%</td></tr>
            </tbody></table>
            <p className="muted" style={{ marginTop: 8 }}>{es
              ? `Se aplica la inflación de ${mName(nextYm(infFrom))} a ${mName(infTo)}, ambos incluidos. Serie del INPC disponible de ${mName(months[0])} a ${mName(months.at(-1) ?? "")}.`
              : `Applies inflation from ${mName(nextYm(infFrom))} through ${mName(infTo)}. CPI available ${mName(months[0])} to ${mName(months.at(-1) ?? "")}.`}</p>
          </>
        ) : <div className="empty">{es ? "Sin datos de inflación" : "No inflation data"}</div>}
      </div>
    </div>
  );
}
