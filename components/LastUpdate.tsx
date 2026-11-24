"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** «Última actualización»: consulta cada 3 minutos (solo con la pestaña visible) la hora de la última corrida y, si hay datos nuevos, refresca la página. */
export default function LastUpdate({ initial, lang, label, vet }: { initial: string | null; lang: "es" | "en"; label: string; vet: string }) {
  const [at, setAt] = useState(initial);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return; // pestaña en segundo plano: no se consulta
      try {
        const r = await fetch("/api/last-run", { cache: "no-store" });
        const j = await r.json();
        if (alive && j.finished_at && (!at || Date.parse(j.finished_at) > Date.parse(at))) {
          setAt(j.finished_at);
          if (at) router.refresh(); // datos nuevos: se vuelve a pedir la página
        }
      } catch { /* sin conexión: se reintenta en la próxima vuelta */ }
    };
    tick();
    const id = setInterval(tick, 180_000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [at, router]);
  const txt = at ? new Intl.DateTimeFormat(lang === "es" ? "es-VE" : "en-US", { timeZone: "America/Caracas", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at)) : "—";
  const live = at ? Date.now() - Date.parse(at) < 2 * 3600e3 : false;
  return <span><i className={`dot ${live ? "live" : ""}`} />{label}: {txt} {vet}</span>;
}
