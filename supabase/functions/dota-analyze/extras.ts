// Дополнительные разборы: фарм-предмет и эффективность фарма, потенциальный и фактический фарм,
// тепловая карта фарма и маршрут (Stratz), чат и настроение (OpenDota). В балл вины не входят.

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// ---------- Stratz: кривые и позиции ----------

export const STRATZ_DETAIL_QUERY = `query ($id: Long!) {
  match(id: $id) {
    players {
      playerSlot
      heroAverage { time networth cs }
      stats { networthPerMinute lastHitsPerMinute }
      playbackData {
        csEvents { time positionX positionY gold }
        playerUpdatePositionEvents { time x y }
        killEvents { time target positionX positionY isGank isTpRecently isSmoke }
        assistEvents { time target positionX positionY }
        itemUsedEvents { time itemId target }
        abilityUsedEvents { time abilityId target }
        runeEvents { time rune action }
        heroDamageEvents { time target value byAbility }
      }
    }
  }
}`;

// Координаты Stratz: клетки карты 64..192 по x и y (Свет — внизу слева).
const MAP_MIN = 64, MAP_SIZE = 128, CELLS = 16;
const cell = (v: number) => Math.max(0, Math.min(CELLS - 1, Math.floor(((v - MAP_MIN) / MAP_SIZE) * CELLS)));

export type Detail = {
  avg_nw: number[] | null; // средняя ценность героя на этой позиции по минутам (Stratz heroAverage)
  nw: number[] | null; // ценность игрока по минутам
  heat: [number, number, number][]; // [клетка x, клетка y, золото с крипов] — сетка 16×16
  route: [number, number, number][]; // [секунда, x, y] каждые 15 с
};

export function stratzDetails(data: any): Map<number, Detail> {
  const out = new Map<number, Detail>();
  for (const p of data?.match?.players ?? []) {
    const avg = (p.heroAverage ?? []).filter((h: any) => h?.networth != null).sort((a: any, b: any) => a.time - b.time);
    const heat = new Map<string, number>();
    for (const c of p.playbackData?.csEvents ?? []) {
      if (c.positionX == null || c.positionY == null) continue;
      const k = `${cell(c.positionX)},${cell(c.positionY)}`;
      heat.set(k, (heat.get(k) ?? 0) + (c.gold ?? 0));
    }
    const moves = [...(p.playbackData?.playerUpdatePositionEvents ?? [])].sort((a: any, b: any) => a.time - b.time);
    const route: [number, number, number][] = [];
    let i = 0;
    if (moves.length) {
      for (let t = 0; t <= moves.at(-1).time; t += 15) {
        while (i + 1 < moves.length && moves[i + 1].time <= t) i++;
        route.push([t, moves[i].x, moves[i].y]);
      }
    }
    out.set(p.playerSlot, {
      avg_nw: avg.length ? avg.map((h: any) => Math.round(h.networth)) : null,
      nw: p.stats?.networthPerMinute ?? null,
      heat: [...heat].map(([k, g]) => { const [x, y] = k.split(',').map(Number); return [x, y, g] as [number, number, number]; }),
      route,
    });
  }
  return out;
}

// ---------- фарм-предмет и эффективность фарма ----------

// Предметы, которые берут ради ускорения фарма (первый купленный из списка).
const FARM_ITEMS = ['bfury', 'hand_of_midas', 'radiance', 'maelstrom', 'mjollnir', 'mask_of_madness', 'helm_of_the_dominator', 'helm_of_the_overlord'];
const WINDOW = 5; // минут до и после покупки

export function farmReport(p: any, detail: Detail | undefined, itemNames: Record<string, string>, durationSec: number) {
  const gold: number[] | undefined = p.gold_t;
  const lh: number[] | undefined = p.lh_t;
  const minutes = Math.floor(durationSec / 60);
  const rate = (arr: number[] | undefined, a: number, b: number) =>
    arr && b - a >= 2 && arr[b] != null && arr[a] != null ? Math.round(((arr[b] - arr[a]) / (b - a)) * 10) / 10 : null;

  // Фарм-предмет
  let item: any = null;
  const buy = (p.purchase_log ?? []).find((x: any) => FARM_ITEMS.includes(x.key) && x.time > 0);
  if (buy) {
    const m = Math.floor(buy.time / 60);
    const a = Math.max(0, m - WINDOW), b = Math.min(gold ? gold.length - 1 : m, m + WINDOW);
    item = {
      key: buy.key,
      name: itemNames[buy.key] ?? buy.key,
      minute: m,
      gpm_before: rate(gold, a, m), gpm_after: rate(gold, m, b),
      lhpm_before: rate(lh, a, m), lhpm_after: rate(lh, m, b),
      // средний игрок на этом герое и позиции к этой минуте (ценность)
      nw_at: detail?.nw?.[m] ?? null,
      avg_nw_at: detail?.avg_nw?.[m] ?? null,
    };
  }

  // Потенциальный и фактический фарм
  const deadSec = p.life_state_dead ?? null;
  const totalGold = p.total_gold ?? (p.gold_per_min != null ? Math.round((p.gold_per_min * durationSec) / 60) : null);
  const aliveMin = deadSec != null ? Math.max(1, (durationSec - deadSec) / 60) : null;
  const lostToDeaths = deadSec != null && totalGold != null && aliveMin ? Math.round((totalGold / aliveMin) * (deadSec / 60)) : null;
  const end = detail?.nw?.length ? Math.min(detail.nw.length, detail.avg_nw?.length ?? 0) - 1 : -1;
  const nwEnd = end >= 0 ? detail!.nw![end] : null;
  const avgEnd = end >= 0 ? detail!.avg_nw![end] : null;
  const at = (arr: number[] | null | undefined, m: number) => (arr && arr[m] != null ? arr[m] : null);

  if (!item && lostToDeaths == null && nwEnd == null) return null;
  return {
    item,
    gold_total: totalGold,
    dead_min: deadSec != null ? Math.round(deadSec / 6) / 10 : null,
    lost_to_deaths: lostToDeaths,
    potential: totalGold != null && lostToDeaths != null ? totalGold + lostToDeaths : null,
    nw_curve: detail?.nw ?? null,
    avg_curve: detail?.avg_nw ?? null,
    checkpoints: [10, 20, 30].filter((m) => m <= minutes && at(detail?.nw, m) != null && at(detail?.avg_nw, m) != null)
      .map((m) => ({ minute: m, nw: at(detail?.nw, m), avg: at(detail?.avg_nw, m) })),
    end: nwEnd != null && avgEnd ? { minute: end, nw: nwEnd, avg: avgEnd, pct: Math.round((nwEnd / avgEnd) * 100) } : null,
  };
}

// ---------- чат и настроение ----------

// \b в JS работает только с латиницей — для русских слов границу задаём через (?<![а-яё]) / (?![а-яё]).
const RU = (w: string) => `(?<![а-яё])(?:${w})(?![а-яё])`;
const TAGS: [string, RegExp][] = [
  ['feed', new RegExp(`фид|фижу|feed|руин|ruin|\\bafk\\b|афк|ливн|ливаю|продаю шмот|продам шмот|sell items|run ?down|раш на базу`, 'i')],
  ['toxic', new RegExp([
    'бля', 'ху[йеёя]', 'пизд', `(?<![а-яё])(?:за|у|вы|от|на|про|до|по)?[её]б`, 'сук[аи]', 'долбо', 'дебил', 'идиот', 'даун', RU('мать|мамк[ауи]|мам[ау]'),
    'пид[оа]?р', RU('чмо'), RU('туп(?:ой|ые|ица|орылый)'), RU('нуб|нубы|нубас'), RU('мудак|урод|клоун|бот|боты|дно'),
    '\\bnoob', '\\btrash\\b', 'fuck', 'idiot', 'retard', 'stupid', '\\bkys\\b', 'shit', 'cyka', 'blya', 'suka', 'pidor', 'eblan', 'nahui', 'naxui', 'debil', 'daun', 'mudak', '\\bclown', '\\bbots?\\b',
  ].join('|'), 'i')],
  ['give_up', new RegExp(`\\bff\\b|сда[её]м|сдаемся|сдаёмся|сдаваться|${RU('проиграли|лузанули|гг|энд')}|равно проиграем|\\bend\\b|\\bgg\\b|game is hard`, 'i')],
  ['blame', new RegExp(`репорт|report|репорч|из-?за тебя|из-?за него|из-?за вас|руинер|ruiner|ты фидишь`, 'i')],
  ['positive', new RegExp(`\\bgl\\b|\\bhf\\b|\\bwp\\b|nice|молодц|красав|спасибо|${RU('спс|сорян|сорри|давай|отлично|изи')}|thx|\\bty\\b|sorry|well played|good job|get back|careful`, 'i')],
];

export function chatReport(od: any, players: any[], wheel: Record<string, string>, loser: string) {
  const raw: any[] = od.chat ?? [];
  if (!raw.length) return null;
  const slotOf = (c: any) => c.player_slot ?? (c.slot != null ? (c.slot < 5 ? c.slot : c.slot + 123) : null);
  const end = od.duration ?? 0;
  const messages = raw
    .filter((c) => c.type === 'chat' || c.type === 'chatwheel')
    .map((c) => {
      const wheelMsg = c.type === 'chatwheel';
      const text = wheelMsg ? wheel[String(c.key)] ?? null : String(c.key ?? '').slice(0, 200);
      if (!text) return null;
      let tags = TAGS.filter(([, re]) => re.test(text)).map(([t]) => t);
      // «gg» в последние 2 минуты — обычное прощание, а не сдача
      if (tags.includes('give_up') && /\bg+g+\b|(?<![а-яё])гг(?![а-яё])/i.test(text) && c.time > end - 120) tags = tags.filter((t) => t !== 'give_up');
      return { t: c.time, slot: slotOf(c), text, wheel: wheelMsg, tags };
    })
    .filter((m): m is NonNullable<typeof m> => !!m && m.slot != null)
    .slice(0, 200);
  if (!messages.length) return null;

  // По каждому игроку: сколько каких сообщений и проверка «грозился фидить → правда умирал»
  const byPlayer = players.map((p: any, i: number) => {
    const mine = messages.filter((m) => m.slot === p.slot);
    const count = (t: string) => mine.filter((m) => m.tags.includes(t)).length;
    const deaths: number[] = (od.players[i]?.deaths_log ?? []).map((d: any) => d.time).filter((t: any) => typeof t === 'number');
    const threat = mine.find((m) => m.tags.includes('feed'));
    let feedCheck: any = null;
    if (threat) {
      const after = deaths.filter((t) => t >= threat.t && t < threat.t + 300).length;
      const before = deaths.filter((t) => t < threat.t).length;
      const usual = threat.t > 60 ? (before / (threat.t / 60)) * 5 : 0; // обычно смертей за 5 минут
      feedCheck = { minute: Math.floor(threat.t / 60), text: threat.text, deaths_5min: after, usual_5min: Math.round(usual * 10) / 10, confirmed: after >= 3 && after >= 2 * usual };
    }
    return {
      slot: p.slot, messages: mine.length,
      toxic: count('toxic'), feed: count('feed'), give_up: count('give_up'), blame: count('blame'), positive: count('positive'),
      first_toxic_minute: mine.find((m) => m.tags.includes('toxic')) ? Math.floor(mine.find((m) => m.tags.includes('toxic'))!.t / 60) : null,
      feed_check: feedCheck,
    };
  }).filter((x) => x.messages > 0);

  const team = (side: string) => {
    const ps = byPlayer.filter((x) => (x.slot < 128 ? 'radiant' : 'dire') === side);
    const t = (k: 'toxic' | 'give_up' | 'blame' | 'positive' | 'feed') => sum(ps.map((x: any) => x[k]));
    const bad = t('toxic') + t('blame') + 2 * t('feed');
    const mood = t('feed') ? 'грозились фидить' : bad >= 4 ? 'токсичный' : t('give_up') >= 2 ? 'сдались' : bad >= 1 ? 'напряжённый' : t('positive') ? 'дружный' : 'спокойный';
    return { mood, toxic: t('toxic'), blame: t('blame'), give_up: t('give_up'), positive: t('positive'), feed: t('feed') };
  };
  const winner = loser === 'radiant' ? 'dire' : 'radiant';
  return { messages, players: byPlayer, losers: team(loser), winners: team(winner) };
}
