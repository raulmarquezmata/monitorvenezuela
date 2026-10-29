type Point = [string, number];

/** Unidades en bolívares que se pueden pasar a dólares: unidad Bs → (unidad US$, multiplicador). */
export const BS_UNITS: Record<string, { usd: string; usdEn: string; k: number }> = {
  "miles de Bs": { usd: "millones US$", usdEn: "US$ million", k: 1e3 / 1e6 },
  "millones Bs": { usd: "millones US$", usdEn: "US$ million", k: 1 },
  "Bs": { usd: "US$", usdEn: "US$", k: 1 },
};
export const isBsUnit = (unitEs?: string | null) => Boolean(unitEs && BS_UNITS[unitEs]);

/** Convierte una serie en Bs a US$ con el tipo de cambio vigente en cada fecha (el último disponible ≤ fecha). */
export function toUsd(points: Point[], unitEs: string, rate: Point[]): Point[] {
  const u = BS_UNITS[unitEs];
  if (!u || !rate.length) return [];
  const out: Point[] = [];
  let j = 0;
  for (const [d, v] of points) {
    while (j + 1 < rate.length && rate[j + 1][0] <= d) j++;
    if (rate[j][0] <= d && rate[j][1]) {
      // no usar tasas viejas para fechas muy posteriores (más de 45 días sin dato)
      if ((Date.parse(d) - Date.parse(rate[j][0])) / 864e5 <= 45) out.push([d, (v * u.k) / rate[j][1]]);
    }
  }
  return out;
}

