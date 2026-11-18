import type { FedMeeting, Latest, Point } from "@/lib/data";
import { num } from "@/lib/format";
import { valueAt } from "@/lib/stats";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { Sparkline } from "./Kpi";
import { CardControls, CardScope } from "./CardScope";
import LineChart from "./LineChart";
import { chartLabels } from "./ui";

const fdate = (d: string, lang: Lang, year = false) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" })
    .format(new Date(`${d}T12:00:00Z`)).replace(/\.$/, "");
const rng = (lo: number, hi: number, lang: Lang) => `${num(lo, lang, 2)}–${num(hi, lang, 2)}`;
const pb = (v: number | null, lang: Lang) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v} ${lang === "es" ? "pb" : "bp"}`);
const cls = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "down" : "up");

/** Variación de la tasa objetivo (techo) frente al día antes de la última reunión y frente al cierre del año anterior, en pb. */
export function fedChanges(pts: Point[], lastMeeting?: string) {
  const last = pts.at(-1);
  if (!last) return { meeting: null, ytd: null };
  const before = lastMeeting ? valueAt(pts, new Date(Date.parse(`${lastMeeting}T00:00:00Z`) - 864e5).toISOString().slice(0, 10)) : undefined;
  const dec = valueAt(pts, `${Number(last[0].slice(0, 4)) - 1}-12-31`);
  return { meeting: before ? Math.round((last[1] - before[1]) * 100) : null, ytd: dec ? Math.round((last[1] - dec[1]) * 100) : null };
}

/** Tarjeta: rango objetivo vigente, cambio en la última reunión y en el año. */
export function FedRateCard({ points, lang, lastMeeting, href }: { points: Point[]; lang: Lang; lastMeeting?: string; href?: string }) {
  const es = lang === "es";
  const last = points.at(-1);
  const ch = fedChanges(points, lastMeeting);
  const spark = points.filter((p) => last && p[0] >= `${Number(last[0].slice(0, 4)) - 2}${last[0].slice(4)}`);
  const body = (
    <>
      <div className="card-top"><h3>{es ? "Fed: tasa objetivo" : "Fed funds target"}</h3><span className="date">{last ? fdate(last[0], lang) : ""}</span></div>
      <div className="big">{last ? rng(last[1] - 0.25, last[1], lang) : "—"}<small>%</small></div>
      <div className="stats">
        <span className="st"><small>{es ? `Últ. reunión${lastMeeting ? ` (${fdate(lastMeeting, lang)})` : ""}` : `Last meeting${lastMeeting ? ` (${fdate(lastMeeting, lang)})` : ""}`}</small><b className={cls(ch.meeting)}>{ch.meeting === 0 ? (es ? "sin cambio" : "no change") : pb(ch.meeting, lang)}</b></span>
        <span className="st"><small>{es ? "En el año" : "YTD"}</small><b className={cls(ch.ytd)}>{pb(ch.ytd, lang)}</b></span>
      </div>
      <div className="kpi-foot"><span /><Sparkline points={spark} /></div>
    </>
  );
  return href ? <a href={href} className="card">{body}</a> : <div className="card">{body}</div>;
}

/** Tarjeta: qué descuenta el mercado para la próxima reunión (subir / mantener / bajar y rango más probable). */
export function FedNextCard({ m, lang, href }: { m?: FedMeeting; lang: Lang; href?: string }) {
  const es = lang === "es";
  if (!m) return null;
  const opts = [
    { k: "hike", label: es ? "Subir" : "Hike", v: m.hike },
    { k: "hold", label: es ? "Mantener" : "Hold", v: m.hold ?? Math.max(0, 100 - m.hike - m.cut) },
    { k: "cut", label: es ? "Bajar" : "Cut", v: m.cut },
  ];
  const best = opts.reduce((a, b) => (b.v > a.v ? b : a));
  const body = (
    <>
      <div className="card-top"><h3>{es ? `Fed: próxima reunión` : "Fed: next meeting"}</h3><span className="date">{fdate(m.date, lang)}</span></div>
      <div className="big">{best.label} <span style={{ fontSize: "0.7em" }}>{num(best.v, lang, 0)}%</span></div>
      <div className="stats">{opts.map((o) => <span className="st" key={o.k}><small>{o.label}</small><b>{num(o.v, lang, 0)}%</b></span>)}</div>
      {m.top && <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{es ? "Rango más probable" : "Most likely range"}: <b>{rng(m.top.lo, m.top.hi, lang)}%</b> ({num(m.top.p, lang, 0)}%){(m.big ?? 0) >= 1 ? <> · {es ? "movimiento de 50 pb" : "50 bp move"}: {num(m.big, lang, 0)}%</> : null}</p>}
    </>
  );
  return href ? <a href={href} className="card">{body}</a> : <div className="card">{body}</div>;
}

/** Tabla de reuniones: rango más probable y probabilidad de subir, mantener o bajar en cada una. */
export function FedTable({ meetings, lang }: { meetings: FedMeeting[]; lang: Lang }) {
  const es = lang === "es";
  const r = { textAlign: "right" as const };
  return (
    <table className="tbl compact">
      <thead><tr><th>{es ? "Reunión" : "Meeting"}</th><th>{es ? "Rango más probable" : "Most likely range"}</th><th style={r}>{es ? "Subir" : "Hike"}</th><th style={r}>{es ? "Mantener" : "Hold"}</th><th style={r}>{es ? "Bajar" : "Cut"}</th></tr></thead>
      <tbody>{meetings.map((m) => {
        const hold = m.hold ?? Math.max(0, 100 - m.hike - m.cut);
        const mx = Math.max(m.hike, hold, m.cut);
        const b = (v: number) => ({ ...r, fontWeight: v === mx ? 700 : 400 });
        return (
          <tr key={m.date}><td>{fdate(m.date, lang, true)}</td>
            <td>{m.top ? <>{rng(m.top.lo, m.top.hi, lang)}% <span className="muted">({num(m.top.p, lang, 0)}%)</span></> : `${num(m.rate, lang, 2)}%`}</td>
            <td style={b(m.hike)}>{num(m.hike, lang, 0)}%</td><td style={b(hold)}>{num(hold, lang, 0)}%</td><td style={b(m.cut)}>{num(m.cut, lang, 0)}%</td></tr>);
      })}</tbody>
    </table>
  );
}

/** Nómina no agrícola: empleos creados según la primera publicación (barras) frente a lo esperado por el mercado (marca). */
export function NfpCard({ actual, expected, s, lang }: { actual: Point[]; expected: Point[]; s?: Latest; lang: Lang }) {
  const es = lang === "es";
  const d = t(lang);
  const last = actual.at(-1), exp = last ? expected.find((p) => p[0] === last[0]) : undefined;
  const surprise = last && exp ? last[1] - exp[1] : null;
  const mes = last ? new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${last[0]}T12:00:00Z`)) : "";
  return (
    <div className="card span-all" id="nfp">
      <CardScope initial="MAX">
        <div className="card-top"><h3>{es ? "Nómina no agrícola: publicada vs. esperada" : "Nonfarm payrolls: actual vs. expected"}</h3><span className="date">{mes}</span></div>
        <CardControls lang={lang} ranges={["1A", "MAX"]} rangeLabels={d.range} />
        {last && <div className="stats" style={{ margin: "10px 0" }}>
          <span className="st"><small>{es ? "Publicado" : "Actual"}</small><b>{num(last[1], lang, 0)} {es ? "mil" : "k"}</b></span>
          <span className="st"><small>{es ? "Esperado" : "Expected"}</small><b>{exp ? `${num(exp[1], lang, 0)} ${es ? "mil" : "k"}` : "—"}</b></span>
          <span className="st"><small>{es ? "Sorpresa" : "Surprise"}</small><b className={surprise == null ? "" : surprise >= 0 ? "up" : "down"}>{surprise == null ? "—" : `${surprise > 0 ? "+" : ""}${num(surprise, lang, 0)} ${es ? "mil" : "k"}`}</b></span>
        </div>}
        <LineChart bars height={260} lang={lang} unit={es ? "mil empleos" : "k jobs"} decimals={0} labels={chartLabels(lang)}
          series={[{ name: es ? "Publicado (primera lectura)" : "Actual (first print)", points: actual }, { name: es ? "Esperado (consenso)" : "Expected (consensus)", points: expected, tick: true, color: "var(--text)" }]} />
      </CardScope>
      <div className="src"><span>{d.source}: {es ? "BLS (dato del día de publicación, antes de revisiones) y consenso del mercado vía " : "BLS (release-day figure, before revisions) and market consensus via "}<a href="https://www.fxblue.com/calendar/item/Nonfarm_Payrolls_US" target="_blank" rel="noreferrer">FX Blue</a>{s ? "" : ""}</span></div>
    </div>
  );
}
