// Who Ruined 2.0 — сервер-посредник.
// Этапы 2–3 плана: шаги 1–7 (ввод, кеш, сбор данных, проверка режима,
// полнота разбора, ливеры/фидеры, позиции). Этап 4: шаги 8–9 (балл вины и вердикт) — в score.ts.
//
// POST { match: "8123456789" | "https://www.opendota.com/matches/8123456789", refresh?: true }
// POST { player: "123456" | "7656119..." | "https://steamcommunity.com/profiles/7656119..." }
// POST { feedback: { match_id, slot | null, comment? } } — кнопка «Не согласен» (slot null = «проиграли командой»)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { scorePlayers, teamReport, verdictFor } from './score.ts';

const VERSION = 6; // версия логики: при изменении старые разборы в кеше пересчитываются
const OD = 'https://api.opendota.com/api';
const STRATZ = 'https://api.stratz.com/graphql';
const PARSE_WAIT_MS = 4 * 60_000; // сколько ждём разбора OpenDota/Stratz, потом считаем по тому, что есть
const POLL_MIN_MS = 10_000; // чаще не ходим в OpenDota/Stratz, даже если страница спрашивает
const STRATZ_RECHECK_MS = 60 * 60_000; // разбор без Stratz пересчитываем не чаще раза в час
const MIN_DURATION = 15 * 60;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- справочники ----------

// game_mode OpenDota. Разбираем только обычные режимы; Турбо — с пометкой.
const MODES: Record<number, string> = {
  1: 'All Pick', 2: 'Captains Mode', 3: 'Random Draft', 4: 'Single Draft', 5: 'All Random',
  16: 'Captains Draft', 22: 'Ranked All Pick', 23: 'Turbo',
};
const MODE_NAMES: Record<number, string> = {
  0: 'Неизвестный', 6: 'Intro', 7: 'Diretide', 8: 'Reverse Captains Mode', 9: 'Greeviling', 10: 'Обучение',
  11: 'Mid Only', 12: 'Least Played', 13: 'Limited Heroes', 14: 'Compendium', 15: 'Пользовательская игра',
  17: 'Balanced Draft', 18: 'Ability Draft', 19: 'Событие', 20: 'All Random Deathmatch', 21: '1 на 1 мид',
  24: 'Mutation', 25: 'Coaches Challenge',
};
// lobby_type OpenDota: 0 обычная, 2 турнир, 5/6/7 рейтинг, 9 Battle Cup. Лобби (1), боты (4), 1v1 (8) — нет.
const LOBBIES_OK = new Set([0, 2, 5, 6, 7, 9]);
const LOBBY_NAMES: Record<number, string> = {
  1: 'лобби', 3: 'обучение', 4: 'игра с ботами', 8: '1 на 1', 12: 'событие', 13: 'режим новичков',
};
// leaver_status: 0 нет, 1 ненадолго отключался, 2 отключился надолго, 3 покинул, 4 AFK, 5–6 не подключился
const LEAVER_TEXT: Record<number, string> = {
  2: 'отключился и не вернулся', 3: 'покинул игру', 4: 'стоял AFK', 5: 'не подключился к игре', 6: 'не подключился к игре',
};

async function getJson(url: string, init?: RequestInit, timeoutMs = 20_000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* не JSON */ }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(body?.error ?? text).toString().slice(0, 200)}`);
  return body;
}

async function cacheGet(key: string) {
  const { data } = await db.from('dota_cache').select('*').eq('key', key).maybeSingle();
  return data as { key: string; status: string; version: number; result: any; updated_at: string } | null;
}
async function cachePut(key: string, status: string, result: unknown) {
  const { error } = await db.from('dota_cache').upsert({
    key, status, version: VERSION, result, updated_at: new Date().toISOString(),
  });
  if (error) console.error('cache', error.message);
}

// Справочники OpenDota (герои, предметы) держим в кеше сутки: в ответ кладём только нужное странице.
async function reference<T>(key: string, url: string, build: (raw: any) => T): Promise<T> {
  const c = await cacheGet(key);
  if (c && Date.now() - Date.parse(c.updated_at) < 86_400_000) return c.result;
  try {
    const value = build(await getJson(url));
    await cachePut(key, 'ref', value);
    return value;
  } catch (e) {
    console.error(key, e);
    return c?.result ?? build({});
  }
}
type Heroes = { names: Record<string, string>; keys: Record<string, string> };
// keys: npc_dota_hero_antimage → antimage (имя картинки на CDN Steam)
const heroRefs = () => reference<Heroes>('ref:heroes2', `${OD}/constants/heroes`, (raw) => {
  const out: Heroes = { names: {}, keys: {} };
  for (const h of Object.values<any>(raw)) {
    out.names[h.id] = h.localized_name;
    out.keys[h.id] = String(h.name ?? '').replace('npc_dota_hero_', '');
  }
  return out;
});
// id предмета → [ключ картинки, название]
const itemRefs = () => reference<Record<string, [string, string]>>('ref:items', `${OD}/constants/items`, (raw) => {
  const out: Record<string, [string, string]> = {};
  for (const [k, it] of Object.entries<any>(raw)) if (it?.id) out[it.id] = [k, it.dname ?? k];
  return out;
});

// ---------- шаг 1: ввод ----------

function parseMatchId(input: unknown): string | null {
  const s = String(input ?? '').trim();
  const m = s.match(/matches?\/(\d{6,12})/i) ?? s.match(/^(\d{6,12})$/);
  return m ? m[1] : null;
}

const STEAM64_BASE = 76561197960265728n;
function parseAccountId(input: unknown): string | null {
  const s = String(input ?? '').trim();
  const m = s.match(/(?:profiles|players)\/(\d+)/i) ?? s.match(/^(\d+)$/);
  if (!m) return null;
  const n = BigInt(m[1]);
  return (n > STEAM64_BASE ? n - STEAM64_BASE : n).toString();
}

async function recentMatches(input: unknown) {
  const id = parseAccountId(input);
  if (!id) {
    return json({
      status: 'error',
      message: 'Не понял профиль. Нужен числовой Steam ID, Friend ID или ссылка вида steamcommunity.com/profiles/…, opendota.com/players/…',
    }, 400);
  }
  const [rows, heroes] = await Promise.all([getJson(`${OD}/players/${id}/recentMatches`), heroRefs()]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ status: 'error', message: 'Игр не найдено: профиль скрыт или игрок не открыл статистику матчей в Dota 2.' }, 404);
  }
  return json({
    status: 'matches',
    account_id: Number(id),
    matches: rows.slice(0, 10).map((m: any) => ({
      match_id: m.match_id,
      start_time: m.start_time,
      duration_sec: m.duration,
      hero: heroes.names[m.hero_id] ?? `Герой ${m.hero_id}`,
      hero_key: heroes.keys[m.hero_id] ?? null,
      won: (m.player_slot < 128) === m.radiant_win,
      kda: `${m.kills}/${m.deaths}/${m.assists}`,
      game_mode: MODES[m.game_mode] ?? MODE_NAMES[m.game_mode] ?? `режим ${m.game_mode}`,
    })),
  });
}

// ---------- шаг 3: Stratz ----------

const STRATZ_QUERY = `query ($id: Long!) {
  match(id: $id) {
    id didRadiantWin durationSeconds gameMode lobbyType parsedDateTime
    topLaneOutcome midLaneOutcome bottomLaneOutcome
    players {
      playerSlot isRadiant heroId steamAccountId
      position lane role imp intentionalFeeding leaverStatus
    }
  }
}`;

// Токен: секрет STRATZ_TOKEN, а если его нет — Supabase Vault (функция dota_stratz_token, только service_role).
let stratzToken: string | null = null;
async function getStratzToken() {
  if (stratzToken) return stratzToken;
  stratzToken = Deno.env.get('STRATZ_TOKEN') ?? (await db.rpc('dota_stratz_token')).data ?? null;
  return stratzToken;
}

async function stratzCall(query: string, variables: unknown) {
  const token = await getStratzToken();
  if (!token) throw new Error('нет токена Stratz');
  const body = await getJson(STRATZ, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'STRATZ_API' },
    body: JSON.stringify({ query, variables }),
  });
  if (body?.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join('; ').slice(0, 300));
  return body.data;
}

// missing: Stratz ещё не загрузил матч или не определил позиции (свежая игра) — имеет смысл подождать.
type StratzResult = { ok: boolean; match?: any; error?: string; missing?: boolean };
async function fetchStratz(matchId: string): Promise<StratzResult> {
  try {
    const data = await stratzCall(STRATZ_QUERY, { id: Number(matchId) });
    if (!data?.match) return { ok: false, missing: true, error: 'Stratz пока не загрузил этот матч' };
    const noPositions = !(data.match.players ?? []).some((p: any) => POS_NUM[p.position]);
    return { ok: true, match: data.match, missing: noPositions };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  }
}

async function requestStratz(matchId: string) {
  try {
    return !!(await stratzCall('mutation ($id: Long!) { retryMatchDownload(matchId: $id) }', { id: Number(matchId) }))?.retryMatchDownload;
  } catch (e) {
    console.error('stratz retry', e);
    return false;
  }
}

// ---------- шаг 7: позиции ----------

const POS_NUM: Record<string, number> = { POSITION_1: 1, POSITION_2: 2, POSITION_3: 3, POSITION_4: 4, POSITION_5: 5 };

// Запасной способ: линия OpenDota (lane_role: 1 лёгкая, 2 мид, 3 сложная, 4 лес)
// + золото на 10-й минуте внутри линии. Кор на линии — у кого больше золота.
function openDotaPositions(team: any[]): Map<number, number> {
  const g10 = (p: any) => p.gold_t?.[10] ?? p.gold_t?.at?.(-1) ?? 0;
  const pos = new Map<number, number>();
  const byLane = (role: number) => team.filter((p) => p.lane_role === role).sort((a, b) => g10(b) - g10(a));
  const plan: [number, number, number][] = [[1, 1, 5], [2, 2, 2], [3, 3, 4]]; // [lane_role, кор, саппорт]
  for (const [role, core, sup] of plan) {
    byLane(role).forEach((p, i) => pos.set(p.player_slot, i === 0 ? core : sup));
  }
  // Повторы (два мида, три на линии, лесник) — раздаём оставшиеся позиции по золоту на 10-й минуте.
  const seen = new Set<number>();
  const ok = new Map<number, number>();
  for (const p of [...team].sort((a, b) => g10(b) - g10(a))) {
    const v = pos.get(p.player_slot);
    if (v && !seen.has(v)) { seen.add(v); ok.set(p.player_slot, v); }
  }
  const free = [1, 2, 3, 4, 5].filter((v) => !seen.has(v));
  for (const p of [...team].sort((a, b) => g10(b) - g10(a))) {
    if (!ok.has(p.player_slot)) ok.set(p.player_slot, free.shift()!);
  }
  return ok;
}

// Проверка признаков: у кора на линии больше добиваний к 10-й минуте, у саппорта больше вардов.
function positionConflicts(p: any, pos: number, team: any[], posOf: (p: any) => number | null): string[] {
  const out: string[] = [];
  const wards = (x: any) => (x.obs_placed ?? 0) + (x.sen_placed ?? 0);
  const lh10 = (x: any) => x.lh_t?.[10] ?? null;
  const pair: Record<number, number> = { 1: 5, 5: 1, 3: 4, 4: 3 };
  const mate = pair[pos] ? team.find((t) => posOf(t) === pair[pos]) : null;
  const core = pos <= 3;
  if (mate && lh10(p) != null && lh10(mate) != null) {
    if (core && lh10(p)! < lh10(mate)!) out.push(`на 10-й минуте добил меньше крипов (${lh10(p)}), чем саппорт на его линии (${lh10(mate)})`);
  }
  if (p.obs_placed != null) {
    const coreWards = Math.max(0, ...team.filter((t) => (posOf(t) ?? 0) <= 3 && t !== p).map(wards));
    const supWards = Math.max(0, ...team.filter((t) => (posOf(t) ?? 0) >= 4 && t !== p).map(wards));
    if (!core && wards(p) === 0 && coreWards > 0) out.push('саппорт без единого варда');
    if (core && wards(p) >= 10 && wards(p) > supWards) out.push(`кор поставил больше всех вардов (${wards(p)})`);
  }
  return out;
}

// ---------- шаги 4–7: разбор матча ----------

function sideOf(slot: number) { return slot < 128 ? 'radiant' : 'dire'; }
const SIDE_RU = { radiant: 'Силы Света', dire: 'Силы Тьмы' } as const;

// Итог линии Stratz (относительно Света) → итог для конкретной стороны.
function laneResultFor(outcome: string | null | undefined, side: 'radiant' | 'dire') {
  if (!outcome) return null;
  if (outcome === 'TIE') return 'ничья';
  const radiantWon = outcome.startsWith('RADIANT');
  const stomp = outcome.endsWith('STOMP');
  const won = radiantWon === (side === 'radiant');
  return won ? (stomp ? 'разгром в нашу пользу' : 'выиграна') : (stomp ? 'разгром' : 'проиграна');
}

// Трон ломали, только если обе T4 проигравших снесены (биты 9–10 tower_status).
// Обе стоят — игра закончилась сдачей/уходом команды.
function ancientDestroyed(od: any, side: string) {
  return (od[`tower_status_${side}`] & 0b11000000000) === 0;
}

// Для графика «Как развивалась игра»: поминутное преимущество Света и события (только у разобранного матча).
function timeline(od: any) {
  if (!Array.isArray(od.radiant_gold_adv)) return null;
  const events: any[] = [];
  for (const f of od.teamfights ?? []) {
    const d = (radiant: boolean) => (f.players ?? []).reduce((s: number, x: any, i: number) => s + ((i < 5) === radiant ? x.deaths ?? 0 : 0), 0);
    const r = d(true), dd = d(false);
    events.push({ t: f.start, type: 'fight', winner: r < dd ? 'radiant' : dd < r ? 'dire' : null, deaths: { radiant: r, dire: dd } });
  }
  for (const o of od.objectives ?? []) {
    if (o.type === 'CHAT_MESSAGE_ROSHAN_KILL') events.push({ t: o.time, type: 'roshan', team: o.team === 2 ? 'radiant' : 'dire' });
    if (o.type === 'building_kill' && /tower|rax|fort/.test(String(o.key))) {
      const lost = String(o.key).includes('goodguys') ? 'radiant' : 'dire';
      const what = /tower(\d)_(\w+)/.exec(o.key);
      const name = what ? `T${what[1]} ${({ top: 'верх', mid: 'мид', bot: 'низ' } as any)[what[2]] ?? what[2]}`
        : /rax/.test(o.key) ? 'казармы' : 'башня у трона';
      events.push({ t: o.time, type: 'building', lost, name });
    }
  }
  return { gold_adv: od.radiant_gold_adv, xp_adv: od.radiant_xp_adv ?? null, events: events.sort((a, b) => a.t - b.t) };
}

function leaveMinute(p: any): number | null {
  // connection_log есть только в разобранном матче: [{time, event, player_slot}]
  const log: any[] = p.connection_log ?? [];
  const bad = log.filter((e) => /DISCONNECT|ABANDON/i.test(String(e.event ?? '')));
  const last = bad.at(-1);
  return last && typeof last.time === 'number' ? Math.max(0, Math.floor(last.time / 60)) : null;
}

function analyze(matchId: string, od: any, stratz: any, heroes: Heroes, items: Record<string, [string, string]>, parseState: any) {
  const radiantWin = !!od.radiant_win;
  const loser: 'radiant' | 'dire' = radiantWin ? 'dire' : 'radiant';
  const parsed = od.version != null;
  const turbo = od.game_mode === 23;
  const flags: string[] = [];
  const base = {
    match_id: Number(matchId),
    version: VERSION,
    links: {
      opendota: `https://www.opendota.com/matches/${matchId}`,
      stratz: `https://stratz.com/matches/${matchId}`,
      dotabuff: `https://www.dotabuff.com/matches/${matchId}`,
    },
  };

  // --- шаг 4: режим ---
  const modeName = MODES[od.game_mode] ?? MODE_NAMES[od.game_mode] ?? `режим ${od.game_mode}`;
  if (!MODES[od.game_mode]) {
    return { status: 'rejected', reason: 'mode', message: `Режим «${modeName}» — такие игры не оцениваем.`, ...base };
  }
  if (!LOBBIES_OK.has(od.lobby_type)) {
    const ln = LOBBY_NAMES[od.lobby_type] ?? `тип лобби ${od.lobby_type}`;
    return { status: 'rejected', reason: 'lobby', message: `Это ${ln} — такие игры не оцениваем.`, ...base };
  }
  if (turbo) flags.push('turbo');

  // --- Stratz → по слоту ---
  const sp = new Map<number, any>();
  if (stratz.ok) for (const p of stratz.match.players ?? []) sp.set(p.playerSlot, p);

  const team = (side: string) => od.players.filter((p: any) => sideOf(p.player_slot) === side);
  const odPos = new Map<number, number>();
  if (parsed) {
    for (const side of ['radiant', 'dire']) for (const [k, v] of openDotaPositions(team(side))) odPos.set(k, v);
  }

  const players = od.players.map((p: any) => {
    const s = sp.get(p.player_slot);
    const side = sideOf(p.player_slot) as 'radiant' | 'dire';
    const stratzPos = s?.position ? POS_NUM[s.position] ?? null : null;
    const fallback = odPos.get(p.player_slot) ?? null;
    const leaverCode = p.leaver_status ?? 0;
    return {
      slot: p.player_slot,
      side,
      lost: side === loser,
      account_id: p.account_id ?? null,
      name: p.personaname ?? (p.account_id ? `Игрок ${p.account_id}` : 'Аноним'),
      hero_id: p.hero_id,
      hero: heroes.names[p.hero_id] ?? `Герой ${p.hero_id}`,
      hero_key: heroes.keys[p.hero_id] ?? null,
      items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5, p.item_neutral]
        .map((id: number, i: number) => (id && items[id] ? { id, key: items[id][0], name: items[id][1], neutral: i === 6 } : null))
        .filter(Boolean),
      net_worth: p.net_worth ?? null,
      rank_tier: p.rank_tier ?? null,
      position: stratzPos ?? fallback,
      position_source: stratzPos ? 'stratz' : fallback ? 'opendota' : null,
      position_opendota: fallback,
      position_uncertain: false,
      position_notes: [] as string[],
      lane_stratz: s?.lane ?? null,
      lane_opendota: p.lane_role ?? null,
      imp: s?.imp ?? null,
      intentional_feeding: s?.intentionalFeeding ?? null,
      leaver: leaverCode >= 2 ? { code: leaverCode, text: LEAVER_TEXT[leaverCode] ?? 'вышел из игры', minute: leaveMinute(p) } : null,
      kda: `${p.kills}/${p.deaths}/${p.assists}`,
      gpm: p.gold_per_min,
      xpm: p.xp_per_min,
      gold_10: p.gold_t?.[10] ?? null,
      lh_10: p.lh_t?.[10] ?? null,
      wards: p.obs_placed != null ? (p.obs_placed ?? 0) + (p.sen_placed ?? 0) : null,
    };
  });

  // --- шаг 7: проверка позиций ---
  for (const side of ['radiant', 'dire'] as const) {
    const odTeam = team(side);
    const posOf = (x: any) => players.find((y: any) => y.slot === x.player_slot)?.position ?? null;
    for (const p of odTeam) {
      const me = players.find((y: any) => y.slot === p.player_slot)!;
      if (!me.position) { me.position_uncertain = true; me.position_notes.push('позицию определить не удалось'); continue; }
      const notes = parsed ? positionConflicts(p, me.position, odTeam, posOf) : [];
      if (me.position_source === 'opendota' && notes.length) me.position_uncertain = true;
      me.position_notes.push(...notes);
    }
  }
  const stratzPositions = players.filter((p: any) => p.position_source === 'stratz').length;
  if (stratzPositions < 10) flags.push(stratzPositions === 0 ? 'positions_from_opendota' : 'positions_partial');
  if (players.some((p: any) => p.position_uncertain)) flags.push('position_uncertain');
  // Совпадение позиций Stratz с признаками OpenDota (понадобится для уверенности на этапе 4).
  const agree = players.filter((p: any) => p.position_source === 'stratz' && p.position_opendota != null);
  const positionsAgree = agree.length ? agree.filter((p: any) => p.position === p.position_opendota).length / agree.length : null;

  // --- линии (итоги Stratz) ---
  const laneOut = stratz.ok ? stratz.match : {};
  const lanes = (['top', 'mid', 'bot'] as const).map((lane) => {
    const raw = { top: laneOut.topLaneOutcome, mid: laneOut.midLaneOutcome, bot: laneOut.bottomLaneOutcome }[lane] ?? null;
    return { lane, outcome_raw: raw, for_losers: laneResultFor(raw, loser) };
  });

  const ancientDown = ancientDestroyed(od, loser);
  const match = {
    duration_sec: od.duration,
    duration_min: Math.round(od.duration / 60),
    start_time: od.start_time,
    game_mode: od.game_mode,
    game_mode_name: modeName,
    lobby_type: od.lobby_type,
    turbo,
    radiant_win: radiantWin,
    losing_side: loser,
    losing_side_ru: SIDE_RU[loser],
    score: { radiant: od.radiant_score, dire: od.dire_score },
    ended_by_ancient: ancientDown,
    parsed,
  };
  const sources = {
    opendota: { ok: true, parsed, parse_requested: !!parseState?.opendota_job },
    stratz: stratz.ok
      ? { ok: true, parsed: !!stratz.match.parsedDateTime, positions: !stratz.missing, requested: !!parseState?.stratz_requested }
      : { ok: false, error: stratz.error, requested: !!parseState?.stratz_requested },
    wait_timed_out: !!parseState?.timed_out,
  };
  if (!parsed) flags.push('not_parsed');
  if (!stratz.ok) flags.push('no_stratz');

  // --- шаг 6: ливеры и фидеры среди проигравших — главный вердикт без формул ---
  const losers = players.filter((p: any) => p.lost);
  const leavers = losers.filter((p: any) => p.leaver)
    .sort((a: any, b: any) => (a.leaver.minute ?? 999) - (b.leaver.minute ?? 999));
  const feeders = losers.filter((p: any) => p.intentional_feeding === true);
  let verdict: any = null;
  if (leavers.length) {
    const l = leavers[0];
    const when = l.leaver.minute != null ? ` на ${l.leaver.minute}-й минуте` : '';
    verdict = {
      kind: 'leaver',
      slot: l.slot,
      text: `Игру испортил выход игрока ${l.name} (${l.hero})${when}: ${l.leaver.text}.`,
      others: leavers.slice(1).map((x: any) => x.slot),
    };
  } else if (feeders.length) {
    const f = feeders[0];
    verdict = {
      kind: 'feeder',
      slot: f.slot,
      text: `Игру испортил намеренный фид игрока ${f.name} (${f.hero}) — так отметил Stratz.`,
      others: feeders.slice(1).map((x: any) => x.slot),
    };
  }

  // --- шаг 8: балл вины каждого из 10 игроков (победители — для сравнения) ---
  const ctx = {
    od, parsed, turbo, minutes: od.duration / 60, players,
    laneOutcomes: { top: laneOut.topLaneOutcome ?? null, mid: laneOut.midLaneOutcome ?? null, bot: laneOut.bottomLaneOutcome ?? null },
  };
  const scores = scorePlayers(ctx);
  players.forEach((p: any, i: number) => { p.score = scores[i].total; p.score_raw = scores[i].raw_total ?? null; p.score_parts = scores[i].parts; p.score_missing = scores[i].missing ?? null; });
  const team_report = teamReport(ctx, loser);

  const common = { ...base, match, sources, flags, lanes, positions_agree: positionsAgree, team_report, timeline: timeline(od), players };
  if (verdict) return { status: 'ready', stage: 'leaver', verdict, ...common };

  // --- шаг 4 (продолжение): короткая игра / досрочная сдача без ливера ---
  if (od.duration < MIN_DURATION) {
    return { status: 'rejected', reason: 'short', message: `Игра шла ${match.duration_min} мин — слишком мало данных для разбора.`, ...common };
  }
  if (!ancientDown) {
    return { status: 'rejected', reason: 'surrender', message: 'Игра закончилась досрочной сдачей — слишком мало данных для честного разбора.', ...common };
  }

  // --- шаг 9: вердикт с порогом ---
  const v = verdictFor(losers.map((p: any) => ({
    slot: p.slot, name: p.name, hero: p.hero, total: p.score, imp: p.imp, position_uncertain: p.position_uncertain,
  })), { parsed, positionsAgree });
  if (!v) return { status: 'ready', stage: 'data', verdict: null, ...common };
  return { status: 'ready', stage: 'verdict', verdict: v, ...common };
}

// ---------- шаги 2, 3, 5: кеш, сбор, ожидание разбора ----------

async function handleMatch(input: unknown, refresh: boolean) {
  const matchId = parseMatchId(input);
  if (!matchId) {
    return json({ status: 'error', message: 'Не нашёл Match ID. Вставьте число или ссылку на матч с OpenDota, Dotabuff или Stratz.' }, 400);
  }
  const key = `match:${matchId}`;
  const cached = await cacheGet(key);
  // Разбор без Stratz (не дождались) через час пересчитываем: вдруг Stratz уже загрузил матч. Второй раз не ждём.
  const age = cached ? Date.now() - Date.parse(cached.updated_at) : 0;
  const recheck = cached?.status !== 'parsing' && cached?.result?.flags?.includes('no_stratz') && age > STRATZ_RECHECK_MS;
  if (cached && cached.version === VERSION && cached.status !== 'parsing' && !refresh && !recheck) {
    return json({ ...cached.result, cached: true });
  }
  // Пока матч разбирается — не дёргаем OpenDota и Stratz чаще раза в 10 секунд.
  let parseState = cached?.status === 'parsing' ? cached.result.parse : null;
  if (recheck && !refresh) parseState = { requested_at: new Date(0).toISOString(), stratz_requested: true };
  if (cached?.status === 'parsing' && age < POLL_MIN_MS) {
    return json(cached!.result);
  }

  let od: any;
  try {
    od = await getJson(`${OD}/matches/${matchId}`);
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes('404')) return json({ status: 'error', message: 'Матч не найден в OpenDota. Проверьте Match ID.' }, 404);
    return json({ status: 'error', message: `OpenDota не ответила: ${msg}` }, 502);
  }
  if (!Array.isArray(od?.players) || od.players.length !== 10) {
    return json({ status: 'error', message: 'У матча нет 10 игроков — такие игры не оцениваем.' }, 422);
  }

  // Шаг 5: нет подробного разбора OpenDota или Stratz ещё не знает матч → просим разобрать и ждём.
  // Короткую игру или сдачу без ливера отсекаем сразу: ждать незачем (leaver_status есть и без разбора).
  const parsed = od.version != null;
  const loserSide = od.radiant_win ? 'dire' : 'radiant';
  const loserLeft = od.players.some((p: any) => sideOf(p.player_slot) === loserSide && (p.leaver_status ?? 0) >= 2);
  const doomed = !loserLeft && (od.duration < MIN_DURATION || !ancientDestroyed(od, loserSide));
  const modeOk = !!MODES[od.game_mode] && LOBBIES_OK.has(od.lobby_type);
  const worthIt = modeOk && !doomed;
  const noStratz: StratzResult = { ok: false, error: 'режим не оцениваем — не запрашивали' };
  const [stratz, heroes, items] = await Promise.all([modeOk ? fetchStratz(matchId) : Promise.resolve(noStratz), heroRefs(), itemRefs()]);
  if (worthIt && (!parsed || stratz.missing)) {
    parseState ??= { requested_at: new Date().toISOString() };
    if (!parsed && !parseState.opendota_job) {
      try { parseState.opendota_job = (await getJson(`${OD}/request/${matchId}`, { method: 'POST' }))?.job?.jobId ?? true; }
      catch (e) { console.error('request parse', e); }
    }
    if (stratz.missing && !parseState.stratz_requested) parseState.stratz_requested = await requestStratz(matchId);
    if (Date.now() - Date.parse(parseState.requested_at) < PARSE_WAIT_MS) {
      const waiting = {
        status: 'parsing',
        match_id: Number(matchId),
        message: 'Матч разбирается, обычно 1–3 минуты.',
        waiting_for: [!parsed && 'opendota', stratz.missing && 'stratz'].filter(Boolean),
        retry_after_sec: 15,
        parse: parseState,
      };
      await cachePut(key, 'parsing', waiting);
      return json(waiting);
    }
    parseState = { ...parseState, timed_out: true }; // не дождались — считаем по тому, что есть
  }

  const result = analyze(matchId, od, stratz, heroes, items, parseState);
  // Кешируем, когда данные окончательные: Stratz ответил с позициями, режим отсечён или ждать уже бесполезно.
  // Если Stratz просто не ответил (сбой, лимит) — не кешируем: позиции и фид появятся при следующем запросе.
  const final = 'reason' in result && (result.reason === 'mode' || result.reason === 'lobby');
  if ((stratz.ok && !stratz.missing) || final || parseState?.timed_out) await cachePut(key, result.status, result);
  else await db.from('dota_cache').delete().eq('key', key);
  return json(result);
}

// Кнопка «Не согласен»: кто, по мнению пользователя, проиграл игру. Потом по этим ответам подбираем веса.
async function saveFeedback(f: any) {
  const matchId = Number(f?.match_id);
  const slot = f?.slot == null ? null : Number(f.slot);
  if (!Number.isSafeInteger(matchId) || matchId <= 0 || (slot != null && !(slot >= 0 && slot <= 4) && !(slot >= 128 && slot <= 132))) {
    return json({ status: 'error', message: 'Неверные данные отзыва' }, 400);
  }
  const cached = await cacheGet(`match:${matchId}`);
  if (!cached || cached.status !== 'ready') return json({ status: 'error', message: 'Этот матч ещё не разбирали' }, 404);
  const v = cached.result.verdict ?? {};
  const { error } = await db.from('dota_feedback').insert({
    match_id: matchId,
    slot,
    comment: String(f.comment ?? '').slice(0, 500) || null,
    verdict_kind: v.kind ?? null,
    verdict_slots: v.slots ?? (v.slot != null ? [v.slot] : []),
    logic_version: cached.version,
  });
  if (error) return json({ status: 'error', message: 'Не удалось сохранить отзыв' }, 500);
  return json({ status: 'ok' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ status: 'error', message: 'Нужен POST' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.player != null) return await recentMatches(body.player);
    if (body.feedback != null) return await saveFeedback(body.feedback);
    return await handleMatch(body.match ?? body.match_id, !!body.refresh);
  } catch (e) {
    console.error(e);
    return json({ status: 'error', message: `Ошибка сервера: ${(e as Error).message}` }, 500);
  }
});
