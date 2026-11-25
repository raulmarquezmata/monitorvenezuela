/** Temas de noticias: qué titulares se relacionan con cada página de indicadores y filtros rápidos de Noticias. */
export const TOPIC_RX: Record<string, RegExp> = {
  cambiario: /d[oó]lar|\bBCV\b|tipo de cambio|cambiari|brecha|intervenci[oó]n|bol[ií]var/i,
  monetario: /encaje|liquidez|base monetaria|\bBCV\b|emisi[oó]n monetaria|cr[eé]dito/i,
  precios: /inflaci[oó]n|precios|\bINPC\b|\bIPC\b|canasta|salario/i,
  externo: /export|import|reservas|balanza|remesas|arancel|comercio exterior|aduan/i,
  banca: /banc[oa]s?\b|banca|cr[eé]dito|encaje|Sudeban|dep[oó]sitos?|tarjetas?/i,
  petroleo: /petr[oó]le|crudo|PDVSA|Chevron|OPEP|\bgas\b|barriles|refiner|hidrocarburos|Repsol|\bEni\b|Shell/i,
  deuda: /deuda|bonos|reestructur|\bFMI\b|\bIMF\b|default|acreedor|EMBI|riesgo pa[ií]s|eurobonos/i,
  commodities: /\boro\b|cacao|caf[eé]|ma[ií]z|trigo|hierro|aluminio|materias primas|miner[ií]a/i,
  mercados: /Bolsa de Valores|\bBVC\b|\bIBC\b|acciones|Sunaval|Bolpriaven|casa de bolsa/i,
  actividad: /\bPIB\b|crecimiento econ|actividad econ|fiscal|presupuesto|recaudaci[oó]n|SENIAT|impuesto|desempleo|\bFMI\b|Venezuela Renace/i,
};

/** Filtros rápidos de la página de Noticias. */
export const THEMES: { id: string; es: string; en: string; rx: RegExp }[] = [
  { id: "cambio", es: "Cambio y BCV", en: "FX and BCV", rx: TOPIC_RX.cambiario },
  { id: "deuda", es: "Deuda y FMI", en: "Debt and IMF", rx: TOPIC_RX.deuda },
  { id: "petroleo", es: "Petróleo y gas", en: "Oil and gas", rx: TOPIC_RX.petroleo },
  { id: "inflacion", es: "Inflación y salarios", en: "Inflation and wages", rx: TOPIC_RX.precios },
  { id: "bolsa", es: "Bolsa y empresas", en: "Stocks and companies", rx: /Bolsa de Valores|\bBVC\b|\bIBC\b|acciones|Sunaval|casa de bolsa|empresa|inversi[oó]n/i },
  { id: "banca", es: "Banca y crédito", en: "Banking and credit", rx: TOPIC_RX.banca },
];
