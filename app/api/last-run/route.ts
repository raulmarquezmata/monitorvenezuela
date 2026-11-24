import { lastRun } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Hora de la última corrida de los robots (la usa la barra «Última actualización»). Sale de la caché de datos,
 *  que se renueva en cuanto un robot avisa (/api/refresh), y la CDN la guarda 60 s: miles de pestañas abiertas
 *  ya no generan una consulta a Supabase cada una. */
export async function GET() {
  const finished = await lastRun();
  return Response.json({ finished_at: finished }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
