import { NextRequest, NextResponse } from "next/server";
import { logDownload } from "@/lib/data";

export const dynamic = "force-dynamic";

const STORAGE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

/** Cuenta la descarga y redirige al archivo: /api/dl?f=nombre&u=/api/export?...  (solo destinos propios o de Supabase). */
export async function GET(req: NextRequest) {
  const f = (req.nextUrl.searchParams.get("f") ?? "").slice(0, 200);
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const ok = (u.startsWith("/") && !u.startsWith("//")) || (STORAGE && u.startsWith(`${STORAGE}/storage/v1/object/public/`));
  if (!ok) return NextResponse.json({ error: "destino no permitido" }, { status: 400 });
  const ref = req.headers.get("referer");
  let page: string | null = null;
  try { page = ref ? new URL(ref).pathname.slice(0, 200) : null; } catch { page = null; }
  await logDownload(f || u.slice(0, 200), page);
  return NextResponse.redirect(new URL(u, req.nextUrl.origin), 302);
}
