// Этап 4: балл вины 0–100 (100 — худший) из пяти частей и вердикт с порогом.
// Веса частей — из плана. Поправки по позициям, калибровка и пороги подобраны на 53 реальных матчах
// (Ranked All Pick, 14.10.2026), см. README → «Подбор».

// Веса частей по позициям, %: Герой, Линия, Смерти, Драки, Роль.
export const WEIGHTS: Record<number, Record<Part, number>> = {
  1: { hero: 35, lane: 20, deaths: 20, fights: 15, role: 10 },
  2: { hero: 35, lane: 20, deaths: 20, fights: 15, role: 10 },
  3: { hero: 25, lane: 20, deaths: 20, fights: 20, role: 15 },
  4: { hero: 20, lane: 15, deaths: 20, fights: 20, role: 25 },
  5: { hero: 15, lane: 15, deaths: 20, fights: 20, role: 30 },
};
export type Part = 'hero' | 'lane' | 'deaths' | 'fights' | 'role';

// Главные показатели героя по позиции (процентили OpenDota benchmarks на этом герое).
const HERO_METRICS: Record<number, string[]> = {
  1: ['gold_per_min', 'last_hits_per_min', 'hero_damage_per_min', 'tower_damage'],
  2: ['gold_per_min', 'xp_per_min', 'hero_damage_per_min', 'kills_per_min'],
  3: ['hero_damage_per_min', 'tower_damage', 'deaths_per_min'],
  4: ['assists_per_min', 'hero_damage_per_min'],
  5: ['assists_per_min', 'hero_healing_per_min', 'deaths_per_min'],
};

// Сдвиг каждой части по позиции: выравнивает её среднее по позиции к общему (иначе, например,
// мид всегда «плох» по урону зданиям, а керри — по доле урона к доле золота).
const POS_OFFSET: Record<number, Record<Part, number>> = {
  1: { hero: 6, lane: 4, deaths: 8, fights: -8, role: -1 },
  2: { hero: 5, lane: -2, deaths: 4, fights: 3, role: -20 },
  3: { hero: -4, lane: -8, deaths: 0, fights: 0, role: 4 },
  4: { hero: -6, lane: -1, deaths: -5, fights: 3, role: 7 },
  5: { hero: 0, lane: 7, deaths: -6, fights: 1, role: 10 },
};
// Калибровка итога: у коров балл гуляет вдвое сильнее, чем у саппортов, и без неё виноватыми
// почти всегда выходили бы pos 1–2. Переводим «насколько хуже типичного игрока этой позиции»
// в общую шкалу: итог = GLOBAL.mean + GLOBAL.sd × (сырой − среднее позиции) / σ позиции.
const POS_CALIB: Record<number, { mean: number; sd: number }> = {
  1: { mean: 41.2, sd: 20.3 },
  2: { mean: 41.5, sd: 20.0 },
  3: { mean: 39.8, sd: 15.0 },
  4: { mean: 38.3, sd: 14.3 },
  5: { mean: 37.6, sd: 12.7 },
};
const GLOBAL = { mean: 39.7, sd: 16.7 };

export const VERDICT = {
  mainGap: 12, // лучший балл выше второго на столько пунктов… (в плане 15; после калибровки шкала у́же)
  mainMin: 60, // …и выше этого → «Главная причина — X»
  twoGap: 5, // разрыв от этого до mainGap → «Больше всех ошиблись X и Y»
  teamMax: 45, // все баллы ниже → «Проиграли командой»
};

// Итог линии для стороны игрока → балл (100 — разгром).
const LANE_SCORE: Record<string, number> = { stomp_lost: 100, lost: 70, tie: 40, won: 10, stomp_won: 0 };

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

type Ctx = {
  od: any;
  parsed: boolean;
  turbo: boolean;
  minutes: number;
  players: any[]; // результат analyze(): slot, side, position, lane_stratz, …
  laneOutcomes: Record<string, string | null>; // top/mid/bot → сырой итог Stratz
};

// Какая линия карты у игрока: лёгкая Света — низ, лёгкая Тьмы — верх.
function mapLane(side: string, lane: string | null): 'top' | 'mid' | 'bot' | null {
  if (lane === 'MID_LANE' || lane === 'mid') return 'mid';
  if (lane === 'SAFE_LANE' || lane === 'safe') return side === 'radiant' ? 'bot' : 'top';
  if (lane === 'OFF_LANE' || lane === 'off') return side === 'radiant' ? 'top' : 'bot';
  return null;
}
const LANE_ROLE: Record<number, string> = { 1: 'safe', 2: 'mid', 3: 'off' };

function outcomeFor(raw: string, side: string): keyof typeof LANE_SCORE {
  if (raw === 'TIE') return 'tie';
  const won = raw.startsWith('RADIANT') === (side === 'radiant');
  const stomp = raw.endsWith('STOMP');
  return won ? (stomp ? 'stomp_won' : 'won') : (stomp ? 'stomp_lost' : 'lost');
}

// ---------- Герой ----------
function heroPart(p: any, pos: number) {
  const b = p.benchmarks;
  if (!b) return null;
  const metrics = HERO_METRICS[pos].filter((k) => b[k]?.pct != null).map((k) => ({
    key: k, raw: r1(b[k].raw), pct: Math.round(b[k].pct * 100),
  }));
  if (!metrics.length) return null;
  // pct у OpenDota: 100 — лучше всех на этом герое (для смертей уже перевёрнуто).
  return { score: clamp(100 - mean(metrics.map((m) => m.pct))), metrics };
}

// ---------- Линия ----------
function lanePart(c: Ctx, me: any, p: any, pos: number) {
  const lane = mapLane(me.side, me.lane_stratz ?? LANE_ROLE[p.lane_role] ?? null);
  const g10 = (x: any) => x.gold_t?.[10] ?? null;
  let outcome: string | null = null;
  let source: string | null = null;
  if (lane && c.laneOutcomes[lane]) {
    outcome = outcomeFor(c.laneOutcomes[lane]!, me.side);
    source = 'stratz';
  } else if (lane && c.parsed) {
    // Без Stratz: суммарное золото на 10-й минуте своей стороны линии против чужой.
    const onLane = (side: string) => c.od.players.filter((x: any, i: number) =>
      c.players[i].side === side && mapLane(side, c.players[i].lane_stratz ?? LANE_ROLE[x.lane_role] ?? null) === lane);
    const mine = sum(onLane(me.side).map((x: any) => g10(x) ?? 0));
    const theirs = sum(onLane(me.side === 'radiant' ? 'dire' : 'radiant').map((x: any) => g10(x) ?? 0));
    if (mine + theirs > 0) {
      const rel = (mine - theirs) / (mine + theirs);
      outcome = rel <= -0.2 ? 'stomp_lost' : rel <= -0.06 ? 'lost' : rel < 0.06 ? 'tie' : rel < 0.2 ? 'won' : 'stomp_won';
      source = 'opendota';
    }
  }
  // Корам — ещё разница золота с прямым соперником на 10-й минуте (1↔3, 2↔2, 3↔1).
  let gd: number | null = null;
  let opponent: number | null = null;
  if (pos <= 3 && g10(p) != null) {
    const oppPos = { 1: 3, 2: 2, 3: 1 }[pos]!;
    const i = c.players.findIndex((x) => x.side !== me.side && x.position === oppPos);
    if (i >= 0 && g10(c.od.players[i]) != null) {
      gd = g10(p) - g10(c.od.players[i]);
      opponent = c.players[i].slot;
    }
  }
  const gdScore = gd == null ? null : clamp(50 - gd / (c.turbo ? 60 : 30)); // ±1500 золота (Турбо ±3000) → 0/100
  const parts = [outcome != null ? LANE_SCORE[outcome] : null, gdScore].filter((x): x is number => x != null);
  if (!parts.length) return null;
  const score = outcome != null && gdScore != null ? 0.6 * LANE_SCORE[outcome] + 0.4 * gdScore : parts[0];
  return { score: clamp(score), lane, outcome, outcome_source: source, gold_diff_10: gd, opponent_slot: opponent };
}

// ---------- Смерти ----------
function deathsPart(c: Ctx, me: any, p: any) {
  const pct = p.benchmarks?.deaths_per_min?.pct;
  if (p.deaths === 0) return { score: 0, deaths: 0, weighted: 0, details: [] };
  if (pct == null) return null;
  const myTeam = me.side === 'radiant' ? 2 : 3;
  const myBuildings = me.side === 'radiant' ? 'goodguys' : 'badguys';
  const [early, late] = c.turbo ? [360, 900] : [600, 1500];
  const objectives: any[] = c.od.objectives ?? [];
  const fights: any[] = c.od.teamfights ?? [];
  const log: any[] = p.deaths_log ?? [];
  const details = log.map((d) => {
    const t = d.time;
    let w = t < early ? 0.7 : t < late ? 1 : 1.5;
    const tags: string[] = [];
    const lost = objectives.some((o) => o.time > t && o.time <= t + 60 && (
      (o.type === 'building_kill' && String(o.key).includes(myBuildings)) ||
      (o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && o.team !== myTeam)));
    if (lost) { w *= 1.5; tags.push('после смерти потеряли здание или Рошана'); }
    const fight = fights.find((f) => t >= f.start - 5 && t <= f.end + 5);
    if (fight?.players) {
      const ours = sum(fight.players.filter((_: any, i: number) => c.players[i]?.side === me.side).map((x: any) => x.deaths ?? 0));
      const theirs = sum(fight.players.filter((_: any, i: number) => c.players[i]?.side !== me.side).map((x: any) => x.deaths ?? 0));
      if (theirs > ours) { w *= 0.5; tags.push('размен: драку выиграли'); }
    }
    return { minute: Math.floor(t / 60), weight: r1(w), gold_lost: d.gold_lost ?? null, tags };
  });
  // Насколько смерти хуже нормы героя (процентиль OpenDota), плюс сдвиг за «дорогие» смерти:
  // средний вес 1.5 → +10, 0.7 → −6. Умножение насыщало шкалу: у половины проигравших было 100.
  const avgWeight = details.length ? mean(details.map((d) => d.weight)) : 1;
  const base = 100 - pct * 100;
  return {
    score: clamp(base + 20 * (avgWeight - 1)),
    deaths: p.deaths,
    deaths_pct: Math.round(pct * 100),
    weighted: r1(sum(details.map((d) => d.weight))),
    avg_weight: r1(avgWeight),
    details,
  };
}

// ---------- Драки ----------
function fightsPart(c: Ctx, me: any, p: any, pos: number) {
  const team = c.od.players.filter((_: any, i: number) => c.players[i].side === me.side);
  const teamKills = sum(team.map((x: any) => x.kills ?? 0));
  const tp = p.teamfight_participation ?? (teamKills ? ((p.kills ?? 0) + (p.assists ?? 0)) / teamKills : null);
  if (tp == null) return null;
  const contrib = (x: any) => (x.hero_damage ?? 0) + (pos >= 4 ? x.hero_healing ?? 0 : 0);
  const teamContrib = sum(team.map((x: any) => (x.hero_damage ?? 0)));
  const teamGold = sum(team.map((x: any) => x.gold_per_min ?? 0));
  const dmgShare = teamContrib ? contrib(p) / teamContrib : 0;
  const goldShare = teamGold ? (p.gold_per_min ?? 0) / teamGold : 0;
  // Кор, который забрал 30% золота и дал 12% урона, получает штраф 60.
  const efficiency = goldShare > dmgShare && goldShare > 0 ? clamp(((goldShare - dmgShare) / goldShare) * 100) : 0;
  const participation = clamp((1 - Math.min(1, tp)) * 100);
  return {
    score: clamp(0.5 * participation + 0.5 * efficiency),
    participation: Math.round(Math.min(1, tp) * 100),
    damage_share: Math.round(dmgShare * 100),
    gold_share: Math.round(goldShare * 100),
  };
}

// ---------- Роль ----------
function rolePart(c: Ctx, me: any, p: any, pos: number) {
  if (!c.parsed || p.obs_placed == null) return null;
  const team = c.od.players.filter((_: any, i: number) => c.players[i].side === me.side);
  const min = Math.max(1, c.minutes);
  const share = (f: (x: any) => number) => {
    const t = sum(team.map(f));
    return t ? f(p) / t : 0;
  };
  if (pos >= 4) {
    const wards = (p.obs_placed ?? 0) + (p.sen_placed ?? 0);
    const g1 = Math.min(1, wards / ((pos === 5 ? 0.4 : 0.25) * min));
    // Сколько прожили обсерверы: время до снятия (или до конца игры), максимум 6 минут.
    const left = new Map<number, number>((p.obs_left_log ?? []).map((o: any) => [o.ehandle, o.time]));
    const lives = (p.obs_log ?? []).map((o: any) => Math.min(360, (left.get(o.ehandle) ?? c.od.duration) - o.time));
    const avgLife = lives.length ? mean(lives) : 0;
    const g2 = Math.min(1, avgLife / (0.7 * 360));
    const dewards = (p.observer_kills ?? 0) + (p.sentry_kills ?? 0);
    const g3 = Math.min(1, dewards / (0.06 * min));
    const g4 = Math.min(1, (p.camps_stacked ?? 0) / (0.05 * min));
    return {
      score: clamp(100 * (1 - (0.35 * g1 + 0.25 * g2 + 0.25 * g3 + 0.15 * g4))),
      wards, obs_avg_life_sec: Math.round(avgLife), dewards, stacks: p.camps_stacked ?? 0,
    };
  }
  if (pos === 3) {
    const heroDmgTaken = (x: any) => sum(Object.entries(x.damage_taken ?? {})
      .filter(([k]) => k.startsWith('npc_dota_hero_')).map(([, v]) => Number(v) || 0));
    const stunShare = share((x) => x.stuns ?? 0);
    const tankShare = share(heroDmgTaken);
    const g = 0.5 * Math.min(1, stunShare / 0.25) + 0.5 * Math.min(1, tankShare / 0.25);
    return {
      score: clamp(100 * (1 - g)),
      stuns_sec: r1(p.stuns ?? 0), stun_share: Math.round(stunShare * 100), damage_taken_share: Math.round(tankShare * 100),
    };
  }
  const towerShare = share((x) => x.tower_damage ?? 0);
  const g = 0.8 * Math.min(1, towerShare / (pos === 1 ? 0.3 : 0.2)) + 0.2 * Math.min(1, p.roshan_kills ?? 0);
  return {
    score: clamp(100 * (1 - g)),
    tower_damage: p.tower_damage ?? 0, tower_share: Math.round(towerShare * 100), roshan_kills: p.roshan_kills ?? 0,
  };
}

// ---------- Балл каждого игрока ----------
export function scorePlayers(c: Ctx) {
  return c.players.map((me, i) => {
    const p = c.od.players[i];
    const pos = me.position;
    if (!pos) return { slot: me.slot, total: null, parts: null };
    const parts: Record<Part, any> = {
      hero: heroPart(p, pos),
      lane: lanePart(c, me, p, pos),
      deaths: deathsPart(c, me, p),
      fights: fightsPart(c, me, p, pos),
      role: rolePart(c, me, p, pos),
    };
    const w = WEIGHTS[pos];
    const avail = (Object.keys(w) as Part[]).filter((k) => parts[k]);
    for (const k of avail) parts[k].score = Math.round(clamp(parts[k].score + POS_OFFSET[pos][k]));
    const wsum = sum(avail.map((k) => w[k]));
    const raw = wsum ? sum(avail.map((k) => w[k] * parts[k].score)) / wsum : null;
    const cal = POS_CALIB[pos];
    const total = raw == null ? null : Math.round(clamp(GLOBAL.mean + GLOBAL.sd * (raw - cal.mean) / cal.sd));
    return { slot: me.slot, total, raw_total: raw == null ? null : Math.round(raw), parts, missing: (Object.keys(w) as Part[]).filter((k) => !parts[k]) };
  });
}

// ---------- Где команда отстала (для вердикта «проиграли командой») ----------
export function teamReport(c: Ctx, loser: 'radiant' | 'dire') {
  const sign = loser === 'radiant' ? 1 : -1; // radiant_gold_adv — преимущество Света
  const adv = (m: number) => (c.od.radiant_gold_adv?.[m] != null ? sign * c.od.radiant_gold_adv[m] : null);
  const lanes = { lost: 0, tie: 0, won: 0 };
  for (const raw of Object.values(c.laneOutcomes)) {
    if (!raw) continue;
    const o = outcomeFor(raw, loser);
    if (o === 'tie') lanes.tie++; else if (o.endsWith('won')) lanes.won++; else lanes.lost++;
  }
  const fights = { won: 0, lost: 0 };
  for (const f of c.od.teamfights ?? []) {
    const d = (side: string) => sum((f.players ?? []).filter((_: any, i: number) => c.players[i]?.side === side).map((x: any) => x.deaths ?? 0));
    const ours = d(loser), theirs = d(loser === 'radiant' ? 'dire' : 'radiant');
    if (ours < theirs) fights.won++; else if (ours > theirs) fights.lost++;
  }
  const myTeam = loser === 'radiant' ? 2 : 3;
  const myBuildings = loser === 'radiant' ? 'goodguys' : 'badguys';
  const obj: any[] = c.od.objectives ?? [];
  const towers = (pred: (o: any) => boolean) => obj.filter((o) => o.type === 'building_kill' && String(o.key).includes('tower') && pred(o)).length;
  return {
    gold_diff: { min10: adv(10), min20: adv(20) },
    lanes,
    fights,
    towers_lost: towers((o) => String(o.key).includes(myBuildings)),
    towers_taken: towers((o) => !String(o.key).includes(myBuildings)),
    roshans: {
      ours: obj.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && o.team === myTeam).length,
      theirs: obj.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && o.team !== myTeam).length,
    },
  };
}

// ---------- Вердикт и уверенность ----------
export function verdictFor(
  losers: { slot: number; name: string; hero: string; total: number | null; imp: number | null; position_uncertain: boolean }[],
  opts: { parsed: boolean; positionsAgree: number | null },
) {
  const ranked = losers.filter((p) => p.total != null).sort((a, b) => b.total! - a.total!);
  if (ranked.length < 2) return null;
  const [a, b] = ranked;
  const gap = a.total! - b.total!;
  let kind: 'main' | 'two' | 'team';
  if (ranked.every((p) => p.total! < VERDICT.teamMax) || gap < VERDICT.twoGap) kind = 'team';
  else if (gap >= VERDICT.mainGap && a.total! > VERDICT.mainMin) kind = 'main';
  else kind = 'two';

  // Уверенность = 40 + 2×разрыв (не больше 40) + 10 за полный разбор + 10 если позиции Stratz совпали с OpenDota.
  const conf: { reason: string; points: number }[] = [{ reason: 'база', points: 40 }];
  if (kind === 'team') {
    const closeness = ranked.every((p) => p.total! < VERDICT.teamMax) ? 20 : Math.min(40, 8 * (VERDICT.twoGap - gap));
    conf.push({ reason: 'баллы игроков близки друг к другу', points: closeness });
  } else {
    conf.push({ reason: `разрыв ${gap} пунктов со следующим игроком`, points: Math.min(40, 2 * gap) });
  }
  if (opts.parsed) conf.push({ reason: 'полный разбор матча', points: 10 });
  if (opts.positionsAgree != null && opts.positionsAgree >= 0.8) conf.push({ reason: 'позиции Stratz совпали с признаками OpenDota', points: 10 });
  const warnings: string[] = [];
  if (kind !== 'team') {
    if (a.position_uncertain) { conf.push({ reason: 'позиция виновника неточная', points: -10 }); warnings.push('position_uncertain'); }
    const imps = losers.filter((p) => p.imp != null);
    if (a.imp != null && imps.length >= 3 && imps.every((p) => p.imp! <= a.imp!)) {
      conf.push({ reason: 'по оценке Stratz (IMP) этот игрок — лучший в команде', points: -15 });
      warnings.push('imp_disagrees');
    }
  }
  const confidence = clamp(sum(conf.map((x) => x.points)));
  const who = (p: typeof a) => `${p.name} (${p.hero})`;
  const text = kind === 'main' ? `Главная причина поражения — ${who(a)}.`
    : kind === 'two' ? `Больше всех ошиблись ${who(a)} и ${who(b)}.`
    : 'Проиграли командой: никто не выделяется заметно сильнее остальных.';
  return {
    kind,
    slots: kind === 'main' ? [a.slot] : kind === 'two' ? [a.slot, b.slot] : [],
    text,
    gap,
    top: ranked.map((p) => ({ slot: p.slot, total: p.total })),
    confidence,
    confidence_parts: conf,
    warnings,
  };
}
