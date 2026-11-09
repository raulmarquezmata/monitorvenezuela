import { lastRunFresh } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Hora de la última corrida de los robots, siempre al día (la usa la barra «Última actualización»). */
export async function GET() {
  const finished = await lastRunFresh();
  return Response.json({ finished_at: finished }, { headers: { "cache-control": "no-store" } });
}
