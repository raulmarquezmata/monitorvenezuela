import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/** Ícono de la app (isotipo de Grupo Solfín) en PNG del tamaño pedido: /pwa-icon?s=192 · ?s=512&m=1 (adaptable). */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const s = Math.min(1024, Math.max(32, Number(q.get("s")) || 192));
  const pad = q.get("m") ? 0.22 : 0.14; // el ícono «adaptable» deja más margen: Android lo recorta en círculo
  const inner = Math.round(s * (1 - 2 * pad));
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "#004AA1" }}>
        <svg width={inner} height={inner} viewBox="6 3 29 36">
          <path fill="#FFFFFF" d="M 29.102 6.621 L 19.664 6.621 L 10.078 16.207 L 10.078 25.641 Z" />
          <path fill="#FFFFFF" d="M 12.797 35.285 L 22.234 35.285 L 31.820 25.699 L 31.820 16.262 Z" />
          <path fill="#121A30" d="M 16.305 20.918 L 11.543 25.641 L 20.977 25.641 L 30.359 16.262 L 20.961 16.262 Z" />
        </svg>
      </div>
    ),
    { width: s, height: s, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
