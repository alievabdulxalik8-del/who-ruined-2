# Who Ruined 2.0

Разбор проигранного матча Dota 2 по Match ID: был ли один игрок, который провалил игру сильнее
остальных, или проиграли командой. Игрока сравниваем с другими игроками на том же герое и позиции.

Сейчас готовы этапы 2–3 плана: сервер-посредник собирает данные из OpenDota и Stratz,
проверяет режим, ждёт разбора матча, ловит ливеров/фидеров и определяет позиции.
Формула оценки (этап 4) и страница (этап 5) — дальше.

## Сервер: Edge Function `dota-analyze`

Supabase-проект `hyjyfmgskcjijyyblvtg`, код в `supabase/functions/dota-analyze/index.ts`,
кеш — таблица `dota_cache` (`supabase/migrations/`). Вызов с anon-ключом проекта:

```
POST https://hyjyfmgskcjijyyblvtg.supabase.co/functions/v1/dota-analyze
{ "match": "8123456789" }                                  // или ссылка OpenDota / Dotabuff / Stratz
{ "match": "8123456789", "refresh": true }                 // пересчитать, минуя кеш
{ "player": "https://steamcommunity.com/profiles/7656…" }  // 10 последних игр для выбора
```

Ответ `status`:
- `parsing` — OpenDota или Stratz ещё разбирают матч; спросить снова через `retry_after_sec` (15 с).
  Ждём до 4 минут, потом считаем по тому, что есть (`sources.wait_timed_out`). Разбор без Stratz через час
  пересчитывается: функция ещё раз спрашивает Stratz.
- `rejected` — не оцениваем: `reason` = `mode` (Ability Draft, 1v1 и т.п.), `lobby` (лобби, боты),
  `short` (короче 15 минут), `surrender` (досрочная сдача без ливера); текст в `message`.
- `ready` — `stage: "leaver"` с готовым `verdict` (ливер или фидер среди проигравших) либо
  `stage: "data"` — данные собраны, вердикт посчитает формула на этапе 4.

Главное в `ready`: `match` (длительность, режим, `turbo`, проигравшая сторона), `players` (позиция 1–5 и её
источник, пометка «позиция неточная» с причинами, IMP Stratz, ливер с минутой, фид), `lanes` (итоги линий
для проигравших), `flags` (`turbo`, `not_parsed`, `no_stratz`, `positions_from_opendota`, `position_uncertain`),
`positions_agree` (доля позиций Stratz, совпавших с признаками OpenDota), `links`.

## Токен Stratz

Не хранится в коде. Функция берёт секрет `STRATZ_TOKEN` из Edge Functions, а если его нет —
из Supabase Vault (`stratz_token`, читается только через `dota_stratz_token()` под service_role).
