/** Lectura de los indicadores para el usuario: qué color lleva una subida y qué significa cada serie. */

/** Series en las que subir es una mala noticia para el lector venezolano: se pintan en rojo al subir y en verde al bajar
 *  (dólar más caro, más inflación, más riesgo país, más desempleo). En el resto, subir es verde. */
export const INVERT = new Set([
  "usd_bcv", "usd_paralelo", "eur_bcv", "brecha_cambiaria",
  "inflacion_mensual", "inflacion_interanual", "inflacion_acumulada", "ipc_eeuu",
  "embi_venezuela", "desempleo", "vix",
  "eeuu_ipc_interanual", "eeuu_ipc_mensual", "eeuu_ipc_subyacente", "eeuu_desempleo",
]);
export const isInverted = (code?: string | null) => !!code && INVERT.has(code);

/** Qué es cada indicador, en una línea (botón ⓘ de las tarjetas). */
export const EXPLAIN: Record<string, { es: string; en: string }> = {
  usd_bcv: { es: "Tipo de cambio oficial que publica el BCV cada día hábil (fecha valor). Si sube, el bolívar se devalúa.", en: "Official exchange rate published by the BCV every business day (value date). A rise means the bolivar depreciates." },
  usd_paralelo: { es: "Precio promedio del dólar (USDT) en Binance P2P, el mercado alternativo. Refleja lo que pagan personas y empresas fuera del sistema oficial.", en: "Average USDT price on Binance P2P, the alternative market: what people and firms pay outside the official system." },
  eur_bcv: { es: "Tipo de cambio oficial del euro que publica el BCV.", en: "Official euro rate published by the BCV." },
  brecha_cambiaria: { es: "Cuánto más caro está el dólar alternativo que el oficial, en %. Una brecha alta indica escasez de divisas en el mercado oficial.", en: "How much more expensive the alternative dollar is than the official rate, in %. A wide gap signals FX scarcity." },
  intervencion_bcv_mensual: { es: "Dólares que el BCV vende a la banca en el mes para abastecer el mercado y contener el tipo de cambio.", en: "Dollars the BCV sells to banks during the month to supply the market and contain the exchange rate." },
  liquidez_m2: { es: "Todo el dinero en manos del público: efectivo y depósitos. Si crece más rápido que la economía, presiona precios y dólar.", en: "All money held by the public: cash and deposits. Growing faster than the economy pressures prices and the dollar." },
  base_monetaria: { es: "Dinero que emite directamente el BCV (efectivo y reservas de los bancos).", en: "Money issued directly by the BCV (cash and bank reserves)." },
  encaje_legal: { es: "Porcentaje de los depósitos que los bancos deben mantener inmovilizado en el BCV. Más encaje = menos crédito.", en: "Share of deposits banks must keep frozen at the BCV. Higher reserve requirement = less credit." },
  inflacion_mensual: { es: "Cuánto subieron los precios al consumidor en el mes (INPC del BCV).", en: "How much consumer prices rose in the month (BCV CPI)." },
  inflacion_interanual: { es: "Cuánto subieron los precios en los últimos 12 meses.", en: "How much prices rose over the last 12 months." },
  reservas_internacionales: { es: "Divisas y oro del BCV: el colchón para intervenir el cambio y pagar compromisos externos.", en: "BCV foreign currency and gold: the cushion for FX intervention and external payments." },
  cuenta_corriente: { es: "Saldo de lo que el país vende y compra al exterior (bienes, servicios, rentas y remesas). Positivo = entran más dólares de los que salen.", en: "Balance of what the country sells and buys abroad (goods, services, income, remittances). Positive = more dollars in than out." },
  exportaciones_petroleras: { es: "Ventas al exterior de crudo y derivados, en dólares.", en: "Foreign sales of crude and products, in dollars." },
  merey: { es: "Precio de la cesta venezolana de crudo pesado (Merey) según la OPEP; suele cotizar con descuento frente al Brent.", en: "Price of Venezuela's heavy crude basket (Merey) per OPEC; usually trades at a discount to Brent." },
  brent: { es: "Precio de referencia mundial del petróleo.", en: "Global oil price benchmark." },
  embi_venezuela: { es: "Prima que piden los inversionistas por la deuda venezolana sobre los bonos del Tesoro de EE.UU., en puntos básicos. Más alto = más riesgo percibido.", en: "Premium investors demand on Venezuelan debt over US Treasuries, in basis points. Higher = more perceived risk." },
  deuda_venz_prom: { es: "Precio promedio de los bonos de la República, en % de su valor nominal. Sube cuando el mercado espera cobrar más en una reestructuración.", en: "Average price of Republic bonds, % of par. Rises when the market expects a better recovery in a restructuring." },
  ibc: { es: "Índice de la Bolsa de Valores de Caracas: el desempeño de las acciones más negociadas.", en: "Caracas Stock Exchange index: performance of the most traded stocks." },
  pib_real_var: { es: "Crecimiento de la economía en el trimestre frente al mismo trimestre del año anterior, descontada la inflación.", en: "Economic growth in the quarter vs. the same quarter a year earlier, net of inflation." },
  pib_nominal_usd: { es: "Tamaño de la economía en dólares corrientes.", en: "Size of the economy in current dollars." },
  pib_real_indice: { es: "Nivel de la economía descontada la inflación, con 2012 = 100: en 2025 era cerca de un tercio de 2012.", en: "Level of the economy net of inflation, 2012 = 100: in 2025 it was about a third of 2012." },
  pib_per_capita_usd: { es: "PIB en dólares dividido entre la población: un indicador aproximado del ingreso promedio.", en: "GDP in dollars divided by population: a rough gauge of average income." },
  desempleo: { es: "Porcentaje de la población activa que busca trabajo y no lo consigue (estimación OIT).", en: "Share of the labor force looking for work without finding it (ILO estimate)." },
  fiscal_saldo_primario_spnf_pib: { es: "Ingresos menos gastos del gobierno central y PDVSA, sin contar intereses de la deuda. Negativo = el Estado gasta más de lo que recauda.", en: "Revenue minus spending of central government and PDVSA, excluding interest. Negative = the state spends more than it collects." },
  fiscal_subsidios_hidroc_pib: { es: "Lo que PDVSA deja de cobrar por vender gasolina, diésel y gas por debajo del precio de mercado.", en: "What PDVSA forgoes by selling gasoline, diesel and gas below market prices." },
  gas_produccion: { es: "Gas natural que se extrae (asociado al petróleo y libre), en miles de millones de pies cúbicos diarios.", en: "Natural gas extracted (associated with oil and free gas), bcf per day." },
  cartera_credito: { es: "Total de préstamos de la banca al sector privado y público.", en: "Total bank lending." },
  tasa_activa: { es: "Tasa de interés promedio que cobran los bancos por sus préstamos.", en: "Average interest rate banks charge on loans." },
  recaudacion_seniat: { es: "Impuestos que recauda el SENIAT en el mes (IVA, ISLR, aduanas y otros).", en: "Taxes collected by SENIAT in the month (VAT, income tax, customs and others)." },
};
