import { revalidatePath, revalidateTag } from "next/cache";
import { lastRunFresh } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Lo llaman los robots al terminar cada corrida: todas las páginas se rehacen con los datos nuevos a la vez
 *  (así Inicio, Cambiario, BVC… muestran siempre la misma cifra y no hay que esperar a que venza la caché).
 *  Solo actúa si hubo una corrida de robots en los últimos 10 minutos, para que nadie pueda forzarlo de afuera. */
export async function POST() {
  const finished = await lastRunFresh();
  const age = finished ? Date.now() - new Date(finished).getTime() : Infinity;
  if (age > 10 * 60_000) return Response.json({ ok: false, reason: "sin corrida reciente" }, { status: 409 });
  revalidateTag("datos");
  revalidatePath("/", "layout");
  return Response.json({ ok: true, finished_at: finished });
}
