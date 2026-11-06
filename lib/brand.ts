/** Marca de la página. Un mismo código sirve para dos versiones idénticas en funciones:
 *  - "solfin"  → Radar Grupo Solfín (logo y paleta de Grupo Solfín) — por defecto
 *  - "monitor" → Monitor Venezuela (la versión verde original)
 *  Se elige con la variable NEXT_PUBLIC_BRAND en Vercel; para tener las dos, se crean dos proyectos
 *  de Vercel conectados al mismo repositorio, cada uno con su valor. */
export type Brand = "solfin" | "monitor";
export const BRAND: Brand = process.env.NEXT_PUBLIC_BRAND === "monitor" ? "monitor" : "solfin";
export const BRAND_NAME = BRAND === "solfin"
  ? { es: "Radar Grupo Solfin", en: "Radar Grupo Solfin" }
  : { es: "Monitor Venezuela", en: "Venezuela Monitor" };
