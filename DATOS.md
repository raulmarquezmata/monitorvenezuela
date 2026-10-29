# Plan de datos

Qué se actualiza solo, de dónde sale y cada cuánto. Generado desde `ingest/catalog.py`; la página **Metodología** muestra lo mismo con el estado en vivo.

## Resumen

- **68 series automáticas** y **2 por archivo** (bonos desde Bloomberg).
- Nada se carga a mano mes a mes. Los archivos del BCV se descargan solos a diario.
- Toda cifra en bolívares se puede ver en dólares con el selector **Bs · US$ oficial · US$ paralelo** (tasa de cada fecha). También se descarga en US$.

## Lo único que haces tú

| Qué | Dónde | Cada cuánto |
|---|---|---|
| Precios de bonos VENZ/PDVSA | Abrir `data/bonos/bloomberg_plantilla.xlsx` en el terminal, guardar como `bloomberg.xlsx` y subirlo a `data/bonos/` en GitHub | Cuando quieras (ideal: viernes) |
| Eventos destacados de la línea de tiempo (opcional) | `config/timeline.json` | Cuando quieras |
| Comentarios de Research (opcional) | `content/research/` | Cuando quieras |

## Todas las series

| Sección | Serie | Método | Frecuencia | Fuente | Cómo se actualiza |
|---|---|---|---|---|---|
| Cambiario | Dólar oficial BCV | Automática | Diaria | BCV | Robot fx cada 30 min (portal BCV por fecha valor). Histórico diario desde la reconversión de oct-2021. |
| Cambiario | Dólar paralelo (Binance P2P) | Automática | Diaria | Binance P2P | Robot fx cada 30 min: mediana de los mejores anuncios de compra y venta USDT/VES en Binance P2P. |
| Cambiario | Brecha cambiaria | Automática | Diaria | Cálculo propio | Se calcula sola: paralelo ÷ oficial − 1. |
| Cambiario | Euro oficial BCV | Automática | Diaria | BCV | Robot fx (portal BCV). |
| Cambiario | Intervención cambiaria (mensual) | Automática | Mensual | BCV · prensa (Banca y Negocios) | Robot de prensa diario: suma de las ventas del BCV a la banca reportadas, o la asignación mensual anunciada. |
| Cambiario | Intervención cambiaria (por operación) | Automática | Semanal | BCV · prensa (Banca y Negocios) | Robot de prensa diario (titulares de Banca y Negocios). |
| Monetario | Liquidez monetaria (M2) | Automática | Semanal | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, histórico desde 1997. |
| Monetario | Base monetaria | Automática | Semanal | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, desde 2001. |
| Monetario | Multiplicador monetario | Automática | Semanal | Cálculo propio | Se calcula solo: M2 ÷ base monetaria. |
| Monetario | Dinero (M1) | Automática | Semanal | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal, desde 1997. |
| Monetario | Encaje legal | Automática | Mensual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual, desde 2004. |
| Precios | Inflación mensual | Automática | Mensual | BCV (vía Finanzas Digital) | Robot inflation diario (cifras oficiales del BCV), histórico desde 1986. |
| Precios | Inflación interanual | Automática | Mensual | BCV (vía Finanzas Digital) | Robot inflation diario, histórico desde 1986. |
| Precios | Inflación acumulada en el año | Automática | Mensual | BCV (vía Finanzas Digital) | Robot inflation diario. |
| Sector externo | Reservas internacionales | Automática | Diaria | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Diaria desde 2016 y mensual desde 1996. |
| Sector externo | Cuenta corriente (balanza de pagos) | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 1997. |
| Sector externo | Exportaciones de bienes | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 1997. |
| Sector externo | Exportaciones petroleras | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Sector externo | Exportaciones no petroleras | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Sector externo | Importaciones de bienes | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Sector externo | Transferencias corrientes (incluye remesas) | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Sector externo | Inversión extranjera directa en el país | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Sector externo | Exportaciones (datos espejo) | Automática | Anual | UN Comtrade | Robot trade los domingos (UN Comtrade). |
| Sector externo | Importaciones (datos espejo) | Automática | Anual | UN Comtrade | Robot trade los domingos (UN Comtrade). |
| Banca | Cartera de créditos (sistema) | Automática | Mensual | SUDEBAN (vía Finanzas Digital) | Robot banking diario: total del sistema y ranking por banco (balances de publicación). |
| Banca | Captaciones del público (sistema) | Automática | Mensual | SUDEBAN (vía Finanzas Digital) | Robot banking diario. |
| Banca | Tasa activa promedio (bancos universales) | Automática | Semanal | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Semanal desde 2005. |
| Banca | Tasa de depósitos a plazo | Automática | Mensual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual desde 2004. |
| Banca | Tasa de depósitos de ahorro | Automática | Mensual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Mensual desde 2004. |
| Banca | Intermediación crediticia | Automática | Mensual | Cálculo propio | Se calcula sola: créditos ÷ captaciones. |
| Petróleo y gas | Producción de crudo · OPEP fuentes secundarias | Automática | Mensual | OPEP MOMR | Robot opec diario: informe MOMR (sale entre el 10 y el 14 de cada mes). |
| Petróleo y gas | Producción de crudo · comunicación directa | Automática | Mensual | OPEP MOMR | Robot opec diario (MOMR). |
| Petróleo y gas | Producción de crudo (EIA, serie larga) | Automática | Mensual | EIA | Robot oil diario (EIA, desde 1973; rezago ~3 meses). |
| Petróleo y gas | Cesta venezolana (Merey) | Automática | Mensual | OPEP MOMR | Robot opec diario (MOMR, tabla de cestas). |
| Petróleo y gas | Brent | Automática | Diaria | EIA | Robot oil (EIA). |
| Petróleo y gas | WTI | Automática | Diaria | EIA | Robot oil (EIA). |
| Petróleo y gas | Gas natural Henry Hub | Automática | Mensual | Banco Mundial | Robot commodities (Banco Mundial). |
| Mercados | Índice Bursátil Caracas (IBC) | Automática | Diaria | BVC | Robot bvc cada 30 min en horario de mercado. |
| Mercados | IBC en dólares (paralelo) | Automática | Diaria | Cálculo propio | Se calcula solo (IBC ÷ paralelo). |
| Mercados | IBC en dólares (oficial) | Automática | Diaria | Cálculo propio | Se calcula solo (IBC ÷ oficial). |
| Mercados | Índice Financiero | Automática | Diaria | BVC | Robot bvc. |
| Mercados | Índice Industrial | Automática | Diaria | BVC | Robot bvc. |
| Mercados | Monto negociado BVC (renta variable) | Automática | Diaria | BVC | Robot bvc. |
| Mercados | Monto negociado BVC (renta fija) | Automática | Diaria | BVC | Robot bvc. |
| Mercados | Volumen mensual BVC (todas las ruedas) | Automática | Mensual | SUNAVAL | Robot sunaval diario (informe mensual de SUNAVAL). |
| Mercados | Mercado de Otros Bienes · monto | Automática | Mensual | SUNAVAL | Robot sunaval diario. |
| Mercados | Mercado de Otros Bienes · operaciones | Automática | Mensual | SUNAVAL | Robot sunaval diario. |
| Mercados | BOLPRIAVEN · monto negociado | Automática | Mensual | SUNAVAL | Robot sunaval diario. |
| Deuda soberana | Bonos de la República · precio promedio | Archivo (tú) | Diaria | Bloomberg | Subir data/bonos/bloomberg.xlsx (plantilla con fórmulas Bloomberg) cuando quieras actualizar; idealmente cada viernes. |
| Deuda soberana | Bonos de PDVSA · precio promedio | Archivo (tú) | Diaria | Bloomberg | Mismo archivo bloomberg.xlsx. |
| Materias primas | Oro | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Mineral de hierro | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Aluminio | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Maíz | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Trigo (US HRW) | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Arroz (Tailandia 5%) | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Café arábica | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Cacao | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Azúcar (mundial) | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Soya | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Urea | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Materias primas | Fosfato diamónico (DAP) | Automática | Mensual | Banco Mundial | Robot commodities semanal (Banco Mundial 'Pink Sheet', desde 1960). |
| Actividad y fiscal | PIB real trimestral (var. interanual) | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Trimestral desde 2008. |
| Actividad y fiscal | PIB petrolero trimestral (var. interanual) | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Actividad y fiscal | PIB no petrolero trimestral (var. interanual) | Automática | Trimestral | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Actividad y fiscal | PIB real anual (var. %) | Automática | Anual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. Anual desde 2008. |
| Actividad y fiscal | PIB petrolero anual (var. %) | Automática | Anual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Actividad y fiscal | PIB no petrolero anual (var. %) | Automática | Anual | BCV | Robot bcv_stats diario: descarga el archivo del BCV y guarda cuando hay publicación nueva. |
| Actividad y fiscal | Recaudación SENIAT | Automática | Mensual | SENIAT (vía prensa) | Robot de prensa diario: cifras mensuales del SENIAT. |
| Actividad y fiscal | Recaudación SENIAT en US$ | Automática | Mensual | SENIAT (vía prensa) | Robot de prensa diario. |

## Horario de los robots (hora de Caracas)

| Robot | Cuándo |
|---|---|
| Frecuente: tipo de cambio (BCV + Binance P2P), BVC, noticias, alertas | Cada 30 min, lun–vie 8:00–20:00; cada 4 h fines de semana |
| Diario: archivos del BCV (liquidez, base, reservas, encaje, tasas, balanza de pagos, PIB, SMC), inflación, prensa (intervención, SENIAT), banca, OPEP, SUNAVAL, EIA, OFAC, línea de tiempo | Todos los días 19:40 |
| Semanal: comercio exterior, agro, materias primas, detector SUDEBAN | Domingos 06:15 |
| Archivos: bonos, línea de tiempo, CSV | Cada vez que subes un archivo a `data/` o `config/` |

## Profundidad histórica

| Serie | Desde |
|---|---|
| Dólar oficial BCV | Reconversión de oct-2021 (diario) |
| Dólar paralelo | Feb-2026 con Yadio como respaldo histórico; Binance P2P se acumula desde la primera corrida |
| Inflación mensual e interanual | 1986 |
| Producción petrolera | 1973 (EIA); OPEP desde los informes de los últimos 30 meses |
| Materias primas | 1960 |
| Brent / WTI | ~20 años diarios |
| Comercio exterior | 2014 |
| Intervención cambiaria | Lo que haya en el archivo de Banca y Negocios (2024+) |
| Bonos | 10 años semanales con la plantilla Bloomberg |
| Liquidez M1/M2 | 1997 (semanal) |
| Base monetaria y multiplicador | 2001 (semanal) |
| Reservas internacionales | 1996 (mensual) y 2016 (diaria) |
| Encaje legal y tasas pasivas | 2004 (mensual) |
| Tasa activa | 2005 (semanal) |
| Balanza de pagos | 1997 (trimestral) |
| PIB real | 2008 (trimestral y anual) |

## Claves y cuentas

| Secreto (GitHub → Settings → Secrets → Actions) | Obligatorio | Para qué | Costo |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Sí | Guardar los datos | Gratis |
| `EIA_API_KEY` | Sí, para la serie larga de petróleo | EIA, Brent, WTI | Gratis |
| `COMTRADE_API_KEY` | No | Más consultas de comercio exterior | Gratis |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | No | Alertas por Telegram | Gratis |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ALERT_EMAILS` | No | Alertas por correo | Gratis |
