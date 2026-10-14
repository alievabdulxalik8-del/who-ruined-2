-- Who Ruined 2.0: кеш разборов и справочников. Доступ только у Edge Function dota-analyze (service_role).
create extension if not exists pg_net; -- только для ручной проверки функции из SQL

create table if not exists public.dota_cache (
  key text primary key,            -- 'match:<id>' или 'ref:heroes'
  status text not null,            -- ready | parsing | rejected | ref
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1   -- версия логики: старые разборы пересчитываются
);
comment on table public.dota_cache is 'Who Ruined 2.0: кеш разборов (match:<id>) и справочников (ref:heroes). Доступ только у Edge Function dota-analyze.';
alter table public.dota_cache enable row level security;
revoke all on public.dota_cache from anon, authenticated;

-- Токен Stratz, если его нет в секретах Edge Functions: лежит в Vault под именем stratz_token.
-- Само значение кладётся вручную: select vault.create_secret('<токен>', 'stratz_token');
create or replace function public.dota_stratz_token() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'stratz_token' limit 1
$$;
revoke all on function public.dota_stratz_token() from public, anon, authenticated;
grant execute on function public.dota_stratz_token() to service_role;
