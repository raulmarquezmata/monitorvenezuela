# Monitor Venezuela

Página pública y bilingüe (ES/EN) que se actualiza sola con mercados y macroeconomía de Venezuela:
Bolsa de Valores de Caracas (renta variable y fija), tipo de cambio oficial y paralelo, liquidez,
reservas, inflación, banca, petróleo y gas, deuda soberana, materias primas, comercio exterior por
rubro, agro, sanciones OFAC, noticias y comentarios de Research.

```
GitHub Actions (robots Python) ──escriben──▶ Supabase (Postgres) ◀──leen── Vercel (Next.js)
        │                                                                      ▲
        └── alertas ─▶ Telegram / Gmail          content/research/*.md ────────┘
```

**Qué es automático, de dónde sale cada dato y cada cuánto: ver [`DATOS.md`](DATOS.md).**

Lo único que se sube a mano son los precios de bonos: abrir `data/bonos/bloomberg_plantilla.xlsx` en el terminal
Bloomberg, guardarlo como `bloomberg.xlsx` y subirlo a `data/bonos/`.

## Secciones

Inicio · Mercado BVC · Macro (cambiario, monetario, precios, sector externo, banca, petróleo y gas, deuda,
materias primas, actividad y fiscal, comercio exterior, agro, comparador, calculadora) · Noticias (titulares,
línea de tiempo, Research) · Metodología (estado de cada serie, robots, fuentes, descargas).

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crea un proyecto (región `us-east-1`).
2. **SQL Editor → New query**: pega todo `supabase/schema.sql` → **Run**. (Se puede volver a correr tras cada actualización del esquema.)
3. **Project Settings → API**: copia `Project URL`, la clave `anon` y la clave `service_role`.

### 2. GitHub
**Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Obligatorio | Valor |
|---|---|---|
| `SUPABASE_URL` | Sí | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | clave `service_role` (secreta: solo aquí) |
| `EIA_API_KEY` | Para petróleo | gratis en https://www.eia.gov/opendata/register.php |
| `COMTRADE_API_KEY` | No | https://comtradedeveloper.un.org |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | No | ver *Alertas* |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ALERT_EMAILS` | No | ver *Alertas* |

Pestaña **Variables**: `SITE_URL` = dirección de la web (para el resumen diario).

Luego **Actions → "Carga histórica inicial" → Run workflow** (30–60 min la primera vez).

### 3. Vercel
1. **Add New → Project → Import** el repositorio (framework: Next.js).
2. **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la `anon`) y, opcional, `NEXT_PUBLIC_REPO_URL`.
3. **Deploy**. La página se refresca sola cada 5 minutos.

## Alertas (gratis, sin dominio)

Reglas en `config/alerts.json` (umbrales, saltos diarios, datos nuevos y resumen diario).
Cada alerta se envía una sola vez; la primera corrida solo registra, para no enviar datos viejos.

**Telegram (recomendado, para un canal público):**
1. En Telegram habla con **@BotFather** → `/newbot` → copia el token → secreto `TELEGRAM_BOT_TOKEN`.
2. Crea un canal (p. ej. `@monitorvenezuela`), añade el bot como **administrador**.
3. Secreto `TELEGRAM_CHAT_ID` = `@nombre_del_canal`.

**Correo desde tu Gmail:** activa la verificación en 2 pasos de la cuenta → https://myaccount.google.com/apppasswords
→ crea una contraseña de aplicación. Secretos: `GMAIL_USER` (tu Gmail), `GMAIL_APP_PASSWORD`, `ALERT_EMAILS`
(destinatarios separados por comas). Límite de Gmail: ~500 correos al día.

## Research

Comentarios e informes en `content/research/` (instrucciones en su `README.md`, plantilla en `_plantilla.md`).
PDFs en `public/research/`. Al guardar en GitHub, Vercel publica en 1–2 minutos.

## Noticias

Medios y búsquedas en `config/news_feeds.json`. El estado de cada fuente aparece en **Datos y fuentes**.

## Diseño

Colores y tipografía centralizados al inicio de `app/globals.css` (tokens claro/oscuro).

## Desarrollo local

```bash
pip install -r ingest/requirements.txt
DRY_RUN=1 python -m ingest.run fx bvc news      # prueba sin escribir
npm install && cp .env.example .env.local && npm run dev
```

> GitHub pausa los cron de un repositorio tras 60 días sin commits: un commit cualquiera (p. ej. un CSV manual) los reactiva.
