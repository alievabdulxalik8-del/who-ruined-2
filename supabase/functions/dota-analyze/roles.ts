// Разбор по позиции (версия 8): то, что важно именно для этой роли. В балл вины не входит.
//   pos 1 — защищал ли свои башни в ранней игре (пешком или через ТП), Рошан: когда брали и какие окна упустили;
//   pos 2 — ганки и перемещения по карте, убийства, реализация ультимейта, руны;
//   pos 4–5 — приходил ли на руны для мидера, стаки, варды, сейв-предметы и на кого их применял;
//   pos 3 — сколько раз начинал драку, предмет для инициации, участие в драках после объектов и Рошана.
// Данные: OpenDota (драки, объективы, покупки, смерти) + Stratz playbackData (позиции, убийства, предметы,
// способности, руны, урон по героям). Координаты Stratz — клетки 64..192, Свет внизу слева.

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const minute = (t: number) => Math.max(0, Math.floor(t / 60));

// Башни (патч 7.3x, из buildingEvents Stratz): ключ из objectives OpenDota → клетка карты.
const TOWERS: Record<string, [number, number]> = {
  goodguys_tower1_top: [78, 142], goodguys_tower2_top: [76, 120], goodguys_tower3_top: [76, 100],
  goodguys_tower1_mid: [114, 116], goodguys_tower2_mid: [102, 104], goodguys_tower3_mid: [90, 94],
  goodguys_tower1_bot: [164, 78], goodguys_tower2_bot: [124, 78], goodguys_tower3_bot: [96, 80],
  badguys_tower1_top: [86, 174], badguys_tower2_top: [126, 174], badguys_tower3_top: [154, 172],
  badguys_tower1_mid: [132, 132], badguys_tower2_mid: [146, 144], badguys_tower3_mid: [160, 156],
  badguys_tower1_bot: [176, 110], badguys_tower2_bot: [178, 130], badguys_tower3_bot: [176, 150],
};
const LANE_RU: Record<string, string> = { top: 'верх', mid: 'мид', bot: 'низ' };
// Точки рун в реке (вода на 2-й и 4-й минуте, руны силы каждые 2 минуты с 6-й).
const RUNE_SPOTS: [number, number][] = [[114, 136], [136, 118]];
const POWER_RUNES = new Set(['HASTE', 'ILLUSION', 'INVISIBILITY', 'REGENERATION', 'ARCANE', 'DOUBLE_DAMAGE', 'SHIELD', 'WATER']);

const TP_ITEMS = ['tpscroll', 'travel_boots', 'travel_boots_2'];
const SAVE_ITEMS = ['glimmer_cape', 'force_staff', 'hurricane_pike', 'lotus_orb', 'cyclone', 'wind_waker', 'mekansm', 'guardian_greaves', 'pipe', 'crimson_guard', 'solar_crest', 'holy_locket', 'ghost', 'blink'];
const TARGET_SAVES = new Set(['glimmer_cape', 'force_staff', 'hurricane_pike', 'lotus_orb', 'cyclone', 'wind_waker', 'solar_crest', 'holy_locket']);
const INIT_ITEMS = ['blink', 'overwhelming_blink', 'swift_blink', 'arcane_blink', 'force_staff', 'hurricane_pike', 'invis_sword', 'silver_edge'];

export const ULTS_QUERY = `{ constants { heroes { id abilities { slot abilityId ability { name language { displayName } stat { isInnate } } } } } }`;
// Ультимейт — способность в 6-м слоте, если она не врождённая (у Invoker и подобных пропускаем).
export function buildUlts(data: any): Record<string, [number, string]> {
  const out: Record<string, [number, string]> = {};
  for (const h of data?.constants?.heroes ?? []) {
    const a = (h.abilities ?? []).find((x: any) => x.slot === 6);
    if (a && !a.ability?.stat?.isInnate && !/generic_hidden/.test(a.ability?.name ?? '')) {
      out[h.id] = [a.abilityId, a.ability?.language?.displayName ?? a.ability?.name ?? 'ультимейт'];
    }
  }
  return out;
}

type Move = { time: number; x: number; y: number };
type PD = {
  slot: number; side: string; heroId: number; idx: number; position: number | null;
  moves: Move[]; kills: any[]; assists: any[]; items: any[]; abilities: any[]; runes: any[]; dmg: any[];
};

function posAt(moves: Move[], t: number): Move | null {
  let lo = 0, hi = moves.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (moves[m].time <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? moves[ans] : moves[0] ?? null;
}
// Был ли рядом с точкой (r клеток) в отрезке времени [t0, t1]
function nearIn(moves: Move[], x: number, y: number, t0: number, t1: number, r: number) {
  const p = posAt(moves, t0);
  if (p && dist(p.x, p.y, x, y) <= r) return true;
  return moves.some((m) => m.time >= t0 && m.time <= t1 && dist(m.x, m.y, x, y) <= r);
}

export function roleReports(od: any, raw: any, players: any[], items: Record<string, [string, string]>, ults: Record<string, [number, string]>) {
  const mp = raw?.match?.players;
  if (!Array.isArray(mp) || !mp.length) return new Map<number, any>();
  const keyToId: Record<string, number> = {};
  const idToName: Record<number, string> = {};
  for (const [id, [k, n]] of Object.entries(items)) { keyToId[k] = Number(id); idToName[Number(id)] = n; }
  const ids = (keys: string[]) => new Set(keys.map((k) => keyToId[k]).filter(Boolean));
  const tpIds = ids(TP_ITEMS);

  const pd: PD[] = players.map((p: any, idx: number) => {
    const s = mp.find((x: any) => x.playerSlot === p.slot)?.playbackData ?? {};
    return {
      slot: p.slot, side: p.side, heroId: p.hero_id, idx, position: p.position,
      moves: [...(s.playerUpdatePositionEvents ?? [])].sort((a: any, b: any) => a.time - b.time),
      kills: s.killEvents ?? [], assists: s.assistEvents ?? [], items: s.itemUsedEvents ?? [],
      abilities: s.abilityUsedEvents ?? [], runes: s.runeEvents ?? [], dmg: s.heroDamageEvents ?? [],
    };
  });
  const sideHeroes = (side: string) => new Set(pd.filter((x) => x.side === side).map((x) => x.heroId));
  const deathsOf = (idx: number): number[] => (od.players[idx]?.deaths_log ?? []).map((d: any) => d.time);
  const fights: any[] = od.teamfights ?? [];
  const present = (f: any, idx: number) => { const x = f.players?.[idx]; return !!x && ((x.damage ?? 0) > 0 || (x.healing ?? 0) > 0 || (x.deaths ?? 0) > 0); };
  const fightDeaths = (f: any, side: string) => sum((f.players ?? []).map((x: any, i: number) => (pd[i]?.side === side ? x.deaths ?? 0 : 0)));
  const allKills = pd.flatMap((x) => x.kills.map((k: any) => ({ ...k, side: x.side })));
  const fightCenter = (f: any) => {
    const ks = allKills.filter((k) => k.time >= f.start - 3 && k.time <= f.end + 3 && k.positionX != null);
    return ks.length ? [sum(ks.map((k) => k.positionX)) / ks.length, sum(ks.map((k) => k.positionY)) / ks.length] as [number, number] : null;
  };
  const objectives: any[] = od.objectives ?? [];
  const towerKills = objectives.filter((o) => o.type === 'building_kill' && /tower[123]_(top|mid|bot)/.test(String(o.key)))
    .map((o) => {
      const k = String(o.key).replace('npc_dota_', '');
      const m = /(goodguys|badguys)_tower(\d)_(\w+)/.exec(k)!;
      return { time: o.time, key: k, side: m[1] === 'goodguys' ? 'radiant' : 'dire', name: `T${m[2]} ${LANE_RU[m[3]] ?? m[3]}`, xy: TOWERS[k] ?? null };
    });
  const roshKills = objectives.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL').map((o) => ({ time: o.time, side: o.team === 2 ? 'radiant' : 'dire' }));
  const goldAdv = (side: string, t: number) => {
    const v = od.radiant_gold_adv?.[minute(t)];
    return v == null ? 0 : side === 'radiant' ? v : -v;
  };

  // ---------- pos 1 ----------
  function carry(me: PD) {
    const mine = towerKills.filter((k) => k.side === me.side);
    const events: { t: number; x: number; y: number; what: string; w0: number; w1: number; fight?: any }[] = [];
    for (const f of fights) {
      if (f.start > 1200) continue;
      const c = fightCenter(f);
      if (!c) continue;
      const tower = Object.entries(TOWERS).find(([k, xy]) =>
        k.startsWith(me.side === 'radiant' ? 'goodguys' : 'badguys') && dist(c[0], c[1], xy[0], xy[1]) <= 16 &&
        !mine.some((d) => d.key === k && d.time < f.start));
      if (tower) {
        const m = /tower(\d)_(\w+)/.exec(tower[0])!;
        events.push({ t: f.start, x: c[0], y: c[1], what: `драка у своей T${m[1]} (${LANE_RU[m[2]]})`, w0: f.start - 10, w1: f.end, fight: f });
      }
    }
    for (const k of mine) {
      if (k.time > 1200 || !k.xy) continue;
      if (events.some((e) => Math.abs(e.t - k.time) < 40 && dist(e.x, e.y, k.xy![0], k.xy![1]) < 16)) continue;
      events.push({ t: k.time, x: k.xy[0], y: k.xy[1], what: `снесли нашу ${k.name}`, w0: k.time - 40, w1: k.time + 5 });
    }
    events.sort((a, b) => a.t - b.t);
    const list = events.map((e) => {
      const came = (e.fight && present(e.fight, me.idx)) || nearIn(me.moves, e.x, e.y, e.w0, e.w1, 16);
      const tp = came && me.items.some((u: any) => tpIds.has(u.itemId) && u.time >= e.w0 - 45 && u.time <= e.w1);
      return { minute: minute(e.t), what: e.what, came, tp };
    });

    // Рошан: когда брали и какие окна упустили (выиграли драку, Рошан жив, золото не хуже −2000, но не пошли).
    const team = pd.filter((x) => x.side === me.side);
    const roshDmg = (i: number) => Number(od.players[i]?.damage?.npc_dota_roshan ?? 0);
    const teamRosh = sum(team.map((x) => roshDmg(x.idx)));
    const windows: { minute: number; taken: boolean }[] = [];
    for (const f of fights) {
      if (f.start < 14 * 60) continue;
      const enemy = me.side === 'radiant' ? 'dire' : 'radiant';
      if (fightDeaths(f, enemy) < 3 || fightDeaths(f, me.side) > 1) continue;
      const last = roshKills.filter((r) => r.time < f.start).at(-1);
      if (last && f.start - last.time < 11 * 60) continue; // Рошан, возможно, ещё не возродился
      if (goldAdv(me.side, f.end) < -2000) continue;
      if (windows.some((w) => Math.abs(w.minute * 60 - f.start) < 120)) continue;
      const taken = roshKills.some((r) => r.side === me.side && r.time >= f.start && r.time <= f.end + 180);
      windows.push({ minute: minute(f.start), taken });
    }
    return {
      kind: 'carry',
      towers: { list: list.slice(0, 10), total: list.length, came: list.filter((x) => x.came).length, tp: list.filter((x) => x.tp).length },
      roshan: {
        ours: roshKills.filter((r) => r.side === me.side).map((r) => minute(r.time)),
        theirs: roshKills.filter((r) => r.side !== me.side).map((r) => minute(r.time)),
        damage_share: teamRosh ? Math.round((roshDmg(me.idx) / teamRosh) * 100) : null,
        windows,
      },
    };
  }

  // ---------- pos 2 ----------
  const onMid = (x: number, y: number) => Math.abs(x - y) <= 14 && !(x < 96 && y < 96) && !(x > 160 && y > 160);
  function runeMoments(limit: number) {
    const out: number[] = [];
    for (let t = 120; t <= limit; t += 120) out.push(t);
    return out;
  }
  const runePicks = pd.flatMap((x) => x.runes
    .filter((r: any) => (r.action === 'PICKUP' || r.action === 'BOTTLE') && POWER_RUNES.has(r.rune))
    .map((r: any) => ({ ...r, side: x.side, slot: x.slot })));
  function ult(me: PD) {
    const u = ults[me.heroId];
    if (!u) return null;
    const [id, name] = u;
    const casts = me.abilities.filter((a: any) => a.abilityId === id).map((a: any) => a.time);
    if (!casts.length) return { name, casts: 0, hit: 0, avg_targets: null, kills_after: 0, damage: false };
    const ultDmg = me.dmg.filter((d: any) => d.byAbility === id && (d.value ?? 0) > 0);
    const enemies = sideHeroes(me.side === 'radiant' ? 'dire' : 'radiant');
    const targets = casts.map((t: number) => new Set(ultDmg.filter((d: any) => d.time >= t && d.time <= t + 6 && enemies.has(d.target)).map((d: any) => d.target)).size);
    const teamKills = allKills.filter((k) => k.side === me.side);
    const killsAfter = casts.filter((t: number) => teamKills.some((k) => k.time >= t && k.time <= t + 8)).length;
    const hit = targets.filter((n: number) => n > 0).length;
    return {
      name, casts: casts.length, hit, damage: ultDmg.length > 0,
      avg_targets: hit ? Math.round((sum(targets) / hit) * 10) / 10 : null,
      kills_after: killsAfter,
    };
  }
  function mid(me: PD) {
    const early = (e: any) => e.time >= 0 && e.time <= 1200 && e.positionX != null;
    const offMid = (e: any) => !onMid(e.positionX, e.positionY);
    const ganksK = me.kills.filter((k: any) => early(k) && offMid(k));
    const ganksA = me.assists.filter((a: any) => early(a) && offMid(a));
    let rotations = 0, away = 0;
    for (let t = 360; t <= 1200; t += 10) {
      const p = posAt(me.moves, t);
      if (!p) break;
      const off = !onMid(p.x, p.y) && !(me.side === 'radiant' ? p.x < 90 && p.y < 90 : p.x > 166 && p.y > 166);
      away = off ? away + 10 : 0;
      if (away === 30) rotations++;
    }
    const moments = runeMoments(1200);
    const myRunes = new Set(runePicks.filter((r) => r.slot === me.slot && r.time <= 1260).map((r) => Math.round(r.time / 120)));
    return {
      kind: 'mid',
      kills: od.players[me.idx]?.kills ?? 0,
      gank_kills: ganksK.length, gank_assists: ganksA.length,
      tp_kills: me.kills.filter((k: any) => k.isTpRecently).length,
      smoke_kills: me.kills.filter((k: any) => k.isSmoke).length,
      rotations,
      ult: ult(me),
      runes: { taken: myRunes.size, total: moments.length },
    };
  }

  // ---------- pos 4–5 ----------
  function itemReport(me: PD, keys: string[]) {
    const log: any[] = od.players[me.idx]?.purchase_log ?? [];
    const allies = new Map(pd.filter((x) => x.side === me.side && x.slot !== me.slot).map((x) => [x.heroId, x.idx]));
    const out: any[] = [];
    for (const k of keys) {
      const buy = log.find((x) => x.key === k);
      if (!buy) continue;
      const id = keyToId[k];
      const uses = me.items.filter((u: any) => u.itemId === id);
      const onAllies = uses.filter((u: any) => allies.has(u.target));
      const saves = onAllies.filter((u: any) => !deathsOf(allies.get(u.target)!).some((d) => d >= u.time && d <= u.time + 6)).length;
      const inFights = uses.filter((u: any) => fights.some((f) => u.time >= f.start - 5 && u.time <= f.end)).length;
      out.push({ key: k, name: idToName[id] ?? k, minute: minute(buy.time), uses: uses.length, on_allies: TARGET_SAVES.has(k) ? onAllies.length : null, saves: TARGET_SAVES.has(k) ? saves : null, in_fights: inFights });
    }
    return out;
  }
  function support(me: PD) {
    const moments = runeMoments(840);
    const been = moments.filter((t) => RUNE_SPOTS.some(([x, y]) => nearIn(me.moves, x, y, t - 25, t + 10, 10))).length;
    const ours = moments.filter((t) => {
      const first = runePicks.filter((r) => r.time >= t - 5 && r.time <= t + 60).sort((a, b) => a.time - b.time)[0];
      return first && first.side === me.side;
    }).length;
    const p = od.players[me.idx] ?? {};
    return {
      kind: 'support',
      runes: { been, total: moments.length, ours },
      stacks: p.camps_stacked ?? null,
      wards: { obs: p.obs_placed ?? null, sen: p.sen_placed ?? null, dewards: p.observer_kills != null ? (p.observer_kills ?? 0) + (p.sentry_kills ?? 0) : null },
      save_items: itemReport(me, SAVE_ITEMS),
    };
  }

  // ---------- pos 3 ----------
  function offlane(me: PD) {
    const enemySide = me.side === 'radiant' ? 'dire' : 'radiant';
    const heroSide = new Map(pd.map((x) => [x.heroId, x.side]));
    let initiated = 0, initiatedWon = 0, teamFights = 0;
    for (const f of fights) {
      const first = (side: string) => {
        let best: { t: number; slot: number } | null = null;
        for (const x of pd) {
          if (x.side !== side) continue;
          const d = x.dmg.find((e: any) => e.time >= f.start - 8 && e.time <= f.end && heroSide.get(e.target) && heroSide.get(e.target) !== side && (e.value ?? 0) > 0);
          if (d && (!best || d.time < best.t)) best = { t: d.time, slot: x.slot };
        }
        return best;
      };
      const a = first(me.side), b = first(enemySide);
      if (!a) continue;
      teamFights++;
      if ((!b || a.t <= b.t) && a.slot === me.slot) {
        initiated++;
        if (fightDeaths(f, enemySide) > fightDeaths(f, me.side)) initiatedWon++;
      }
    }
    const initItems = itemReport(me, INIT_ITEMS).map((it) => ({
      ...it,
      fight_starts: me.items.filter((u: any) => u.itemId === keyToId[it.key] && fights.some((f) => u.time >= f.start - 8 && u.time <= f.start + 3)).length,
    }));
    // Драки сразу после объективов (башни, Рошан) с 10-й минуты: был ли игрок
    const objs = [...towerKills.filter((k) => k.time >= 600).map((k) => k.time), ...roshKills.map((r) => r.time)].sort((a, b) => a - b);
    const after = fights.filter((f) => objs.some((t) => f.start >= t - 30 && f.start <= t + 120));
    return {
      kind: 'offlane',
      initiations: { count: initiated, won: initiatedWon, fights: teamFights },
      init_items: initItems,
      after_objectives: { fights: after.length, present: after.filter((f) => present(f, me.idx)).length },
    };
  }

  const out = new Map<number, any>();
  for (const me of pd) {
    if (!me.moves.length) continue;
    const r = me.position === 1 ? carry(me) : me.position === 2 ? mid(me) : me.position === 3 ? offlane(me)
      : me.position === 4 || me.position === 5 ? support(me) : null;
    if (r) out.set(me.slot, r);
  }
  return out;
}
