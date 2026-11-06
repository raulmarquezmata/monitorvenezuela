// Nombres de emisores legibles: «C.A. FABRICA NACIONAL DE VIDRIO» → «Fábrica Nacional de Vidrio».
// (misma regla que ingest/reportes.py → pretty_name, para que la web y los PDF digan lo mismo)
const ACENTOS: Record<string, string> = {"FABRICA": "Fábrica", "CERAMICA": "Cerámica", "ELECTRICA": "Eléctrica", "ELECTRICIDAD": "Electricidad", "COMPAÑIA": "Compañía", "COMPANIA": "Compañía", "CORPORACION": "Corporación", "INVERSION": "Inversión", "INVERSIONES": "Inversiones", "QUIMICO": "Químico", "QUIMICA": "Química", "PETROLEO": "Petróleo", "TELEFONOS": "Teléfonos", "NACIONAL": "Nacional", "CREDITO": "Crédito", "AGRICOLA": "Agrícola", "INDUSTRIAS": "Industrias", "DOMINGUEZ": "Domínguez", "CIA": "Cía", "PAPEL": "Papel", "FINANCIERA": "Financiera", "ECONOMICO": "Económico", "TECNICA": "Técnica", "MINERIA": "Minería", "MAQUINARIA": "Maquinaria", "SIDERURGICA": "Siderúrgica", "TURISTICA": "Turística", "AEREA": "Aérea", "COMUNICACION": "Comunicación", "PRODUCCION": "Producción", "PUBLICO": "Público", "RAPIDO": "Rápido"};
const MENORES = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "por", "a"]);
const SIGLAS = new Set(["BBVA", "CANTV", "EFE", "BVC", "BNC", "FVI", "SIBE", "BOD", "BFC", "II", "III"]);
const LEGAL = /(^|\s|,)(C\.?\s?A\.?|S\.?\s?A\.?(\s?C\.?\s?A\.?)?|S\.?\s?A\.?\s?I\.?\s?C\.?\s?A\.?)(?=\s|,|$)/gi;

export function prettyName(name: string | null | undefined): string {
  const raw = name ?? "";
  const n = raw.replace(LEGAL, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!n || !(n === n.toUpperCase() || n === n.toLowerCase())) return n || raw;
  return n.split(" ").map((w, i) => {
    const up = w.toUpperCase(), core = up.replace(/[()]/g, "");
    if (SIGLAS.has(core) || (w.startsWith("(") && core.length <= 6)) return up;
    if (ACENTOS[up]) return ACENTOS[up];
    if (i && MENORES.has(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}
