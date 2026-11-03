"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrency } from "./Currency";

type Q = { symbol: string; name: string | null; company: string | null; close: number | null; var_pct: number | null;
  volume: number | null; amount: number | null; mcap_usd: number | null };
type Key = "symbol" | "close" | "var_pct" | "volume" | "amount" | "mcap_usd";

export default function QuoteTable({ rows, lang, labels, showCap = true }: {
  rows: Q[]; lang: "es" | "en"; showCap?: boolean; labels: { symbol: string; company: string; price: string; change: string; volume: string; amount: string; mcap: string };
}) {
  const { cur, fx } = useCurrency();
  const router = useRouter();
  const rate = cur === "USD_BCV" ? fx.bcv.at(-1)?.[1] : cur === "USD_PAR" ? fx.par.at(-1)?.[1] : undefined;
  const k = rate ? 1 / rate : 1;
  const [key, setKey] = useState<Key>("amount");
  const [asc, setAsc] = useState(false);
  const loc = lang === "es" ? "es-VE" : "en-US";
  const f = (v: number | null, dec = 2) => v == null ? "—" : new Intl.NumberFormat(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  const sorted = [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null) return 1; if (y == null) return -1;
    const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return asc ? c : -c;
  });
  const th = (k: Key, label: string, cls = "") => (
    <th className={`sort ${cls}`} onClick={() => { if (k === key) setAsc(!asc); else { setKey(k); setAsc(k === "symbol"); } }}>
      {label}{k === key ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr>{th("symbol", labels.symbol)}<th className="l">{labels.company}</th>{th("close", rate ? labels.price.replace("Bs", "US$") : labels.price)}{th("var_pct", labels.change)}{th("volume", labels.volume)}{th("amount", rate ? labels.amount.replace("Bs", "US$") : labels.amount)}{showCap && th("mcap_usd", labels.mcap)}</tr></thead>
        <tbody>
          {sorted.map((q) => (
            <tr key={q.symbol} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(`/${lang}/bvc/${q.symbol}`); }}>
              <td><Link href={`/${lang}/bvc/${q.symbol}`}>{q.symbol}</Link></td>
              <td className="l" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{q.company ?? q.name}</td>
              <td>{f(q.close == null ? null : q.close * k, rate ? 4 : 2)}</td>
              <td className={q.var_pct == null ? "" : q.var_pct > 0 ? "up" : q.var_pct < 0 ? "down" : "flat"}>{q.var_pct == null ? "—" : `${q.var_pct > 0 ? "+" : ""}${f(q.var_pct)}%`}</td>
              <td>{f(q.volume, 0)}</td>
              <td>{f(q.amount == null ? null : q.amount * k, 0)}</td>
              {showCap && <td>{q.mcap_usd == null ? "—" : new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 }).format(q.mcap_usd)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
