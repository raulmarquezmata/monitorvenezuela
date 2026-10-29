import { NextRequest, NextResponse } from "next/server";
import { history } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Historia de hasta 6 series para el comparador: /api/series?codes=a,b */
export async function GET(req: NextRequest) {
  const codes = (req.nextUrl.searchParams.get("codes") ?? "").split(",").filter(Boolean).slice(0, 6);
  if (!codes.length) return NextResponse.json({});
  const data = await history(codes, 30);
  return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } });
}
