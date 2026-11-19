import type { MetadataRoute } from "next";
import { BRAND, BRAND_NAME } from "@/lib/brand";

/** Para instalar el Radar como app en el teléfono («Agregar a la pantalla de inicio»). */
export default function manifest(): MetadataRoute.Manifest {
  const solfin = BRAND === "solfin";
  return {
    name: BRAND_NAME.es,
    short_name: solfin ? "Radar Solfin" : "Monitor VE",
    description: "Mercados y macroeconomía de Venezuela: BVC, dólar, inflación, petróleo, mercados internacionales e informes del Research Desk.",
    id: "/es",
    start_url: "/es",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    background_color: solfin ? "#0b1122" : "#111613",
    theme_color: solfin ? "#004aa1" : "#3c5246",
    categories: ["finance", "news", "business"],
    icons: [
      { src: "/pwa-icon?s=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?s=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?s=512&m=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Bolsa de Caracas", url: "/es/bvc" },
      { name: "Mercado internacional", url: "/es/internacional" },
      { name: "Dólar", url: "/es/indicadores/cambiario" },
      { name: "Informes", url: "/es/informes" },
    ],
  };
}
