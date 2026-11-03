-- Monitor Venezuela · noviembre 2026
-- Titulares traducidos, noticias y asambleas por acción, y sección Informes.
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez sin problema.

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
