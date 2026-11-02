import { NotConfigured } from "@/components/ui";
import { configured, freshness, latest, newsSources, status, type Latest } from "@/lib/data";
import { date, dateTime, num } from "@/lib/format";
import { CATEGORIES, t, type Lang } from "@/lib/i18n";

export const revalidate = 300;
const REPO = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/raulmarquezmata/monitorvenezuela";
const DOT: Record<string, string> = { ok: "var(--up)", fresh: "var(--up)", partial: "var(--warn)", stale: "var(--warn)", error: "var(--down)", empty: "var(--text-3)" };
const FREQ: Record<string, { es: string; en: string }> = {
  D: { es: "Diaria", en: "Daily" }, W: { es: "Semanal", en: "Weekly" }, M: { es: "Mensual", en: "Monthly" },
  Q: { es: "Trimestral", en: "Quarterly" }, A: { es: "Anual", en: "Annual" },
};

export default async function Datos({ params }: { params: { lang: Lang } }) {
  const { lang } = params;
  const d = t(lang);
  const es = lang === "es";
  if (!configured) return <NotConfigured />;
  const [series, { runs, files }, feeds] = await Promise.all([latest(), status(), newsSources()]);
  const count = (m: string) => series.filter((s) => s.method === m).length;
  const stale = series.filter((s) => freshness(s) !== "fresh");

  const Row = ({ s }: { s: Latest }) => {
    const f = freshness(s);
    return (
      <tr>
        <td className="l" style={{ whiteSpace: "normal", minWidth: 180 }}>{es ? s.name_es : s.name_en}</td>
        <td className="l"><span className={`tag m-${s.method}`}>{d.method[s.method] ?? s.method}</span></td>
        <td className="l">{FREQ[s.frequency ?? ""]?.[lang] ?? s.frequency}</td>
        <td>{s.last_date ? date(s.last_date, lang) : "—"}</td>
        <td className="l"><i className="status-dot" style={{ background: DOT[f] }} />{d.status[f]}</td>
        <td className="l" style={{ whiteSpace: "normal", minWidth: 260, fontSize: 12, color: "var(--text-2)" }}>
          {s.howto_es}{" "}
          {s.method === "manual" && <a href={`${REPO}/edit/main/data/manual/${s.code}.csv`} target="_blank" rel="noreferrer">{es ? "Editar CSV ↗" : "Edit CSV ↗"}</a>}
        </td>
      </tr>
    );
  };

  return (
    <>
      <h1>{d.nav.data}</h1>
      <p className="sub">{es ? "Qué se actualiza solo, qué se carga a mano, de dónde sale cada dato y cada cuánto." : "What updates automatically, what is entered by hand, where each figure comes from and how often."}</p>
      <div className="grid kpis">
        <div className="card kpi"><div className="label">{d.method.auto}</div><div className="val">{count("auto")}</div><div className="meta">{es ? "series con robot" : "robot-fed series"}</div></div>
        <div className="card kpi"><div className="label">{d.method.calibrar}</div><div className="val">{count("calibrar")}</div><div className="meta">{es ? "robot listo, verificando archivo" : "robot ready, verifying file"}</div></div>
        <div className="card kpi"><div className="label">{d.method.manual}</div><div className="val">{count("manual")}</div><div className="meta">{es ? "se cargan en CSV" : "loaded via CSV"}</div></div>
        <div className="card kpi"><div className="label">{es ? "Atrasadas o vacías" : "Overdue or empty"}</div><div className="val">{stale.length}</div><div className="meta">{es ? "según su periodicidad" : "given their frequency"}</div></div>
      </div>

      {CATEGORIES.map((c) => {
        const rows = series.filter((s) => s.category === c);
        if (!rows.length) return null;
        return (
          <section key={c}>
            <h2 style={{ marginTop: 40, marginBottom: 12 }}>{d.cat[c]}</h2>
            <div className="card tbl-wrap">
              <table>
                <thead><tr><th className="l">{es ? "Serie" : "Series"}</th><th className="l">{es ? "Método" : "Method"}</th><th className="l">{es ? "Frecuencia" : "Frequency"}</th><th>{es ? "Último dato" : "Latest"}</th><th className="l">{es ? "Estado" : "Status"}</th><th className="l">{es ? "Cómo se actualiza" : "How it updates"}</th></tr></thead>
                <tbody>{rows.map((s) => <Row key={s.code} s={s} />)}</tbody>
              </table>
            </div>
          </section>
        );
      })}

      <h2 style={{ marginTop: 40, marginBottom: 12 }}>{es ? "Robots" : "Robots"}</h2>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th className="l">Robot</th><th>{es ? "Última corrida" : "Last run"}</th><th className="l">{es ? "Resultado" : "Result"}</th><th>{es ? "Filas" : "Rows"}</th><th className="l">{es ? "Notas" : "Notes"}</th></tr></thead>
          <tbody>
            {runs.map((r: { job: string; finished_at: string; status: string; rows: number; message: string | null }) => (
              <tr key={r.job}>
                <td className="l">{r.job}</td><td>{dateTime(r.finished_at, lang)}</td>
                <td className="l"><i className="status-dot" style={{ background: DOT[r.status] }} />{d.statusOk[r.status] ?? r.status}</td>
                <td>{num(r.rows, lang, 0)}</td>
                <td className="l" style={{ whiteSpace: "normal", maxWidth: 520, fontSize: 12 }}>{(r.message ?? "").replace(/bot\d{6,}:[\w-]{20,}/g, "bot***").replace(/(api_key|key|token)=[^&\s|]+/gi, "$1=***")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 40, marginBottom: 12 }}>{es ? "Fuentes de noticias" : "News sources"}</h2>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th className="l">{es ? "Fuente" : "Source"}</th><th className="l">{es ? "Idioma" : "Lang"}</th><th>{es ? "Última lectura OK" : "Last OK read"}</th><th>{es ? "Titulares" : "Headlines"}</th><th className="l">{es ? "Estado" : "Status"}</th></tr></thead>
          <tbody>
            {feeds.map((f) => {
              const ok = f.last_ok && f.last_run && f.last_ok >= f.last_run;
              return (
                <tr key={f.name}>
                  <td className="l">{f.name}</td><td className="l">{f.lang.toUpperCase()}</td>
                  <td>{dateTime(f.last_ok, lang)}</td><td>{f.last_items ?? "—"}</td>
                  <td className="l"><i className="status-dot" style={{ background: ok ? DOT.ok : DOT.error }} />{ok ? "OK" : (es ? "Sin respuesta" : "No response")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {es ? "Para agregar o quitar medios edite " : "To add or remove outlets edit "}
        <a href={`${REPO}/edit/main/config/news_feeds.json`} target="_blank" rel="noreferrer">config/news_feeds.json</a>.
      </p>

      <h2 style={{ marginTop: 40 }}>{es ? "Descargas" : "Downloads"}</h2>
      <div className="card tbl-wrap" style={{ marginTop: 12 }}>
        <table><tbody>
          {CATEGORIES.map((c) => (
            <tr key={c}><td>{d.cat[c]}</td><td><a className="btn" href={`/api/export?category=${c}&format=xlsx&lang=${lang}`}>Excel</a> <a className="btn" href={`/api/export?category=${c}&format=csv&lang=${lang}`}>CSV</a></td></tr>
          ))}
          <tr><td>{d.nav.bvc} · {d.equities}</td><td><a className="btn" href={`/api/export?bvc=RV&format=xlsx&lang=${lang}`}>Excel</a> <a className="btn" href={`/api/export?bvc=RV&format=csv&lang=${lang}`}>CSV</a></td></tr>
          <tr><td><b>{es ? "Todas las series" : "All series"}</b></td><td><a className="btn" href={`/api/export?format=xlsx&lang=${lang}`}>Excel</a> <a className="btn" href={`/api/export?format=csv&lang=${lang}`}>CSV</a></td></tr>
        </tbody></table>
      </div>

      <h2 style={{ marginTop: 40 }}>{es ? "Archivos detectados (BCV, OPEP, SUNAVAL, SUDEBAN)" : "Detected files (BCV, OPEC, SUNAVAL, SUDEBAN)"}</h2>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th className="l">{es ? "Archivo" : "File"}</th><th className="l">{es ? "Origen" : "Origin"}</th><th>{es ? "Detectado" : "First seen"}</th></tr></thead>
          <tbody>
            {files.map((f: { url: string; filename: string; page: string; first_seen: string }) => (
              <tr key={f.url}><td className="l"><a href={f.url} target="_blank" rel="noreferrer">{f.filename}</a></td><td className="l">{f.page}</td><td>{dateTime(f.first_seen, lang)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
