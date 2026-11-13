-- ============================================================
-- Monitor Venezuela — esquema Supabase
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin perder datos.
-- ============================================================

-- Catálogo de series macro (lo mantiene ingest/catalog.py)
create table if not exists public.series (
  code        text primary key,
  category    text not null,          -- cambiario, monetario, precios, externo_reservas, banca, petroleo, mercados
  name_es     text not null,
  name_en     text not null,
  unit_es     text,
  unit_en     text,
  frequency   text,                   -- D, W, M, Q, A
  source      text,
  source_url  text,
  notes_es    text,
  notes_en    text,
  decimals    int  default 2,
  sort        int  default 100,
  is_manual   boolean default false,
  method      text default 'auto',    -- auto, calibrar, manual
  stale_days  int  default 30,        -- días sin dato nuevo para marcarla "atrasada"
  howto_es    text,                   -- qué hacer / dónde está el dato
  updated_at  timestamptz default now()
);
alter table public.series add column if not exists method text default 'auto';
alter table public.series add column if not exists stale_days int default 30;
alter table public.series add column if not exists howto_es text;

-- Observaciones (formato largo: una fila por serie y fecha)
create table if not exists public.observations (
  series_code text references public.series(code) on delete cascade,
  date        date not null,
  value       double precision not null,
  source      text,
  updated_at  timestamptz default now(),
  primary key (series_code, date)
);
create index if not exists observations_date_idx on public.observations (date desc);

-- Bolsa de Valores de Caracas: emisores y cotizaciones diarias
create table if not exists public.bvc_symbols (
  symbol      text primary key,
  name        text,
  company     text,
  isin        text,
  currency    text,
  shares_outstanding double precision,
  sector      text,
  market      text default 'RV',
  updated_at  timestamptz default now()
);

create table if not exists public.bvc_quotes (
  date        date not null,
  symbol      text not null,
  name        text,
  open        double precision,
  high        double precision,
  low         double precision,
  close       double precision,
  var_abs     double precision,
  var_pct     double precision,
  volume      double precision,
  amount      double precision,
  trades      integer,
  market      text default 'RV',      -- RV renta variable, RF renta fija
  updated_at  timestamptz default now(),
  primary key (date, symbol)
);
alter table public.bvc_quotes add column if not exists market text default 'RV';
create index if not exists bvc_quotes_symbol_idx on public.bvc_quotes (symbol, date desc);

-- Comercio exterior (datos espejo UN Comtrade, por capítulo HS)
create table if not exists public.trade_flows (
  year         int  not null,
  flow         text not null,         -- X = exportaciones de Venezuela, M = importaciones de Venezuela
  partner_code int  not null,
  partner      text,
  hs2          text not null,
  hs2_desc     text,
  value_usd    double precision,
  net_kg       double precision,
  updated_at   timestamptz default now(),
  primary key (year, flow, partner_code, hs2)
);

-- Producción agrícola y pecuaria (FAOSTAT)
create table if not exists public.agro_production (
  year       int  not null,
  item_code  int  not null,
  item       text,
  element    text not null,           -- production, area, yield
  value      double precision,
  unit       text,
  updated_at timestamptz default now(),
  primary key (year, item_code, element)
);

-- Noticias
create table if not exists public.news (
  id           bigserial primary key,
  url          text unique not null,
  title        text not null,
  source       text,
  published_at timestamptz,
  summary      text,
  category     text,                  -- economia, petroleo, banca, mercados, cambiario, politica, agro
  lang         text default 'es',
  created_at   timestamptz default now()
);
create index if not exists news_published_idx on public.news (published_at desc);

-- Bitácora de los robots
create table if not exists public.ingest_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz default now(),
  finished_at timestamptz,
  status      text,                   -- ok, partial, error
  rows        int default 0,
  message     text
);
create index if not exists ingest_runs_job_idx on public.ingest_runs (job, started_at desc);

-- Salud de cada fuente de noticias
create table if not exists public.news_sources (
  name        text primary key,
  url         text,
  lang        text,
  last_run    timestamptz,
  last_ok     timestamptz,
  last_items  int,
  last_error  text
);

-- Acciones de OFAC relacionadas con Venezuela
create table if not exists public.ofac_actions (
  url        text primary key,
  date       date,
  title      text not null,
  created_at timestamptz default now()
);
create index if not exists ofac_actions_date_idx on public.ofac_actions (date desc);

-- Alertas enviadas (evita duplicados)
create table if not exists public.alerts_log (
  key        text primary key,          -- regla + fecha del dato
  rule       text,
  message    text,
  sent_at    timestamptz default now(),
  channels   text
);

-- Bonos soberanos y de PDVSA
create table if not exists public.bonds (
  ticker    text primary key,
  issuer    text,
  coupon    double precision,
  maturity  date,
  name      text,
  sort      int default 100
);
create table if not exists public.bond_prices (
  ticker     text not null,
  date       date not null,
  price      double precision not null,
  source     text,
  primary key (ticker, date)
);

-- Ranking bancario (cartera y captaciones por banco)
create table if not exists public.bank_ranking (
  period  date not null,
  bank    text not null,
  metric  text not null,               -- creditos, captaciones
  value   double precision,            -- millones de Bs
  share   double precision,            -- % del sistema
  primary key (period, bank, metric)
);

-- Línea de tiempo de eventos
create table if not exists public.events (
  id          text primary key,
  date        date not null,
  title_es    text not null,
  title_en    text,
  body_es     text,
  body_en     text,
  category    text,                    -- politica, petroleo, cambiario, sanciones, mercados, economia, banca
  importance  int default 2,           -- 1 alta, 2 media, 3 baja
  series_code text,                    -- serie para mostrar el gráfico alrededor del evento
  url         text,
  precision   text default 'day',      -- day, month
  origin      text default 'curado'    -- curado, automatico
);
alter table public.events add column if not exists precision text default 'day';
create index if not exists events_date_idx on public.events (date desc);

-- Inventario de archivos publicados por BCV / SUDEBAN (alerta de nuevas publicaciones)
create table if not exists public.source_files (
  url        text primary key,
  page       text,
  filename   text,
  first_seen timestamptz default now(),
  last_seen  timestamptz default now()
);

-- ------------------------------------------------------------
-- Vistas
-- ------------------------------------------------------------
drop view if exists public.latest_observations;
create view public.latest_observations as
with ranked as (
  select o.*, row_number() over (partition by series_code order by date desc) rn
  from public.observations o
)
select s.code, s.category, s.name_es, s.name_en, s.unit_es, s.unit_en, s.frequency,
       s.source, s.source_url, s.decimals, s.sort, s.is_manual, s.method, s.stale_days, s.howto_es,
       cur.date  as last_date,  cur.value  as last_value,
       prev.date as prev_date,  prev.value as prev_value,
       cur.updated_at
from public.series s
left join ranked cur  on cur.series_code  = s.code and cur.rn  = 1
left join ranked prev on prev.series_code = s.code and prev.rn = 2;

drop view if exists public.bvc_latest;
create view public.bvc_latest as
with d as (select market, max(date) as date from public.bvc_quotes group by market)
select q.*, s.company, s.shares_outstanding, s.sector,
       case when s.shares_outstanding is not null and q.market = 'RV' then q.close * s.shares_outstanding end as market_cap_bs
from public.bvc_quotes q
join d on q.date = d.date and q.market = d.market
left join public.bvc_symbols s on s.symbol = q.symbol;

create or replace view public.ingest_status as
select distinct on (job) job, started_at, finished_at, status, rows, message
from public.ingest_runs
order by job, started_at desc;

-- ------------------------------------------------------------
-- Seguridad: lectura pública, escritura solo con service_role
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['series','observations','bvc_symbols','bvc_quotes','trade_flows',
                           'agro_production','news','ingest_runs','source_files',
                           'news_sources','ofac_actions','alerts_log','bonds','bond_prices',
                           'bank_ranking','events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant select on public.latest_observations, public.bvc_latest, public.ingest_status to anon, authenticated;
alter view public.latest_observations set (security_invoker = on);
alter view public.bvc_latest          set (security_invoker = on);
alter view public.ingest_status       set (security_invoker = on);

-- ============================================================
-- Agregado en noviembre 2026 (ver migracion_2026_11_acciones_informes.sql)

-- 1) Noticias: titular en español e inglés + acciones a las que se refiere
alter table public.news add column if not exists title_es text;
alter table public.news add column if not exists title_en text;
alter table public.news add column if not exists symbols  text[];
create index if not exists news_symbols_idx on public.news using gin (symbols);

-- 2) Asambleas de accionistas (y otros eventos de emisores)
create table if not exists public.bvc_events (
  id          text primary key,          -- SIMBOLO:fecha:tipo
  symbol      text not null,
  date        date not null,
  kind        text,                      -- ordinaria, extraordinaria, asamblea
  title       text,
  url         text,
  source      text,                      -- manual, BVC, SUNAVAL, medio
  created_at  timestamptz default now()
);
create index if not exists bvc_events_symbol_idx on public.bvc_events (symbol, date desc);

-- 3) Informes del Research Desk (PDF publicados desde data/informes/)
create table if not exists public.informes (
  id          text primary key,          -- nombre del archivo normalizado
  file        text,
  sha         text,
  size        bigint,
  pages       int,
  url         text,
  thumb_url   text,
  title       text,
  date        date,
  lang        text,                      -- es, en
  topic       text,                      -- petroleo, electricidad, mineria, politica, economia, finanzas, agro
  summary     text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists informes_date_idx on public.informes (date desc);

-- Lectura pública, escritura solo con service_role (igual que el resto)
do $$
declare t text;
begin
  foreach t in array array['bvc_events','informes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
grant select on public.bvc_events, public.informes to anon, authenticated;
-- Noticias descartadas por el filtro v2 (ingest/news_filter.py), con su motivo: se ven en /noticias/descartadas y se guardan 21 días
create table if not exists public.news_rejects (
  url          text primary key,
  title        text not null,
  source       text,
  published_at timestamptz,
  summary      text,
  lang         text,
  reason       text,
  score        int,
  seen_at      timestamptz default now()
);
create index if not exists news_rejects_seen_idx on public.news_rejects (seen_at desc);
alter table public.news_rejects enable row level security;
drop policy if exists "lectura publica" on public.news_rejects;
create policy "lectura publica" on public.news_rejects for select to anon, authenticated using (true);
grant select on public.news_rejects to anon, authenticated;
