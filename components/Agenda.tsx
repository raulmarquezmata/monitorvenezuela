import agenda from "@/config/agenda.json";
import { upcomingEvents } from "@/lib/data";
import type { Lang } from "@/lib/i18n";

type Item = { date: string; es: string; en: string; tipo: string };
const ICON: Record<string, string> = { opep: "🛢️", fed: "🏛️", bcv: "🏦", bvc: "📈", otro: "🗞️" };

/** Próximas fechas: calendario fijo (config/agenda.json), asambleas de emisores y el Radar semanal de cada viernes. */
export default async function Agenda({ lang, days = 30 }: { lang: Lang; days?: number }) {
  const es = lang === "es";
  const today = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const items: Item[] = agenda.fechas.map((x) => ({ date: x.fecha, es: x.es, en: x.en, tipo: x.tipo }));
  // cada viernes: Radar semanal
  for (let t = Date.parse(today); t <= Date.parse(until); t += 864e5) {
    const d = new Date(t);
    if (d.getUTCDay() === 5) items.push({ date: d.toISOString().slice(0, 10), es: "Radar semanal (PDF)", en: "Weekly Radar (PDF)", tipo: "otro" });
  }
  for (const e of await upcomingEvents(today, until))
    items.push({ date: e.date, tipo: "bvc", es: `${e.symbol}: asamblea ${e.kind === "extraordinaria" ? "extraordinaria" : "de accionistas"}`, en: `${e.symbol}: ${e.kind === "extraordinaria" ? "extraordinary" : "shareholders"} meeting` });
  const seen = new Set<string>();
  const list = items.filter((x) => x.date >= today && x.date <= until).sort((a, b) => a.date.localeCompare(b.date))
    .filter((x) => { const k = x.date + x.es; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  const fmt = (d: string) => new Intl.DateTimeFormat(es ? "es-VE" : "en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  return (
    <div className="card">
      <div className="card-top"><h3>{es ? "Próximas fechas" : "Upcoming dates"}</h3><span className="date">{es ? `próximos ${days} días` : `next ${days} days`}</span></div>
      {list.length ? (
        <ul className="agenda">{list.map((x) => <li key={x.date + x.es}><span className="d">{fmt(x.date)}</span><span>{ICON[x.tipo] ?? "•"} {es ? x.es : x.en}</span></li>)}</ul>
      ) : <p className="muted">{es ? "Sin fechas en el calendario." : "No dates on the calendar."}</p>}
    </div>
  );
}
