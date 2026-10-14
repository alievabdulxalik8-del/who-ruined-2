-- Who Ruined 2.0: ответы кнопки «Не согласен». Пишет только Edge Function dota-analyze (service_role).
create table if not exists public.dota_feedback (
  id bigint generated always as identity primary key,
  match_id bigint not null,
  slot int,                      -- кого пользователь считает виновником; null = «проиграли командой»
  comment text,
  verdict_kind text,             -- что сказал сайт: main | two | team | leaver | feeder
  verdict_slots int[] not null default '{}',
  logic_version int,
  created_at timestamptz not null default now()
);
comment on table public.dota_feedback is 'Who Ruined 2.0: ответы кнопки «Не согласен». Пишет только Edge Function dota-analyze.';
alter table public.dota_feedback enable row level security;
revoke all on public.dota_feedback from anon, authenticated;
