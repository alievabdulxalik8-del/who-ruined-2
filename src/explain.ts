// Объяснение вердикта человеческим языком: три причины с цифрами и совет на следующую игру.
import type { Analysis, PartKey, Player } from './types'

export const PART_NAMES: Record<PartKey, string> = {
  hero: 'Герой',
  lane: 'Линия',
  deaths: 'Смерти',
  fights: 'Драки',
  role: 'Роль',
}

// Веса частей по позициям — те же, что в score.ts (для выбора главных причин).
const WEIGHTS: Record<number, Record<PartKey, number>> = {
  1: { hero: 35, lane: 20, deaths: 20, fights: 15, role: 10 },
  2: { hero: 35, lane: 20, deaths: 20, fights: 15, role: 10 },
  3: { hero: 25, lane: 20, deaths: 20, fights: 20, role: 15 },
  4: { hero: 20, lane: 15, deaths: 20, fights: 20, role: 25 },
  5: { hero: 15, lane: 15, deaths: 20, fights: 20, role: 30 },
}

export const POSITION_NAMES: Record<number, string> = {
  1: 'Керри', 2: 'Мид', 3: 'Оффлейн', 4: 'Роумер', 5: 'Саппорт',
}

const METRIC_NAMES: Record<string, string> = {
  gold_per_min: 'GPM',
  xp_per_min: 'XPM',
  last_hits_per_min: 'Добивания в минуту',
  hero_damage_per_min: 'Урон по героям в минуту',
  tower_damage: 'Урон по зданиям',
  kills_per_min: 'Убийства в минуту',
  deaths_per_min: 'Смерти в минуту',
  assists_per_min: 'Помощь в убийствах в минуту',
  hero_healing_per_min: 'Лечение в минуту',
}
export const metricName = (k: string) => METRIC_NAMES[k] ?? k

export const LANE_NAMES = { top: 'верх', mid: 'мид', bot: 'низ' } as const
export const OUTCOME_NAMES: Record<string, string> = {
  stomp_lost: 'разгромлена',
  lost: 'проиграна',
  tie: 'ничья',
  won: 'выиграна',
  stomp_won: 'выиграна с разгромом',
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))

// Одна причина по одной части балла — с цифрами из ответа сервера.
function reasonText(p: Player, part: PartKey, minutes: number): string | null {
  const s = p.score_parts?.[part]
  if (!s) return null
  if (part === 'hero') {
    const m = [...(p.score_parts!.hero!.metrics ?? [])].sort((a, b) => a.pct - b.pct)[0]
    if (!m) return null
    const raw = m.raw >= 100 ? fmt(m.raw) : String(m.raw).replace('.', ',')
    return `${metricName(m.key)} ${raw} — хуже, чем у ${100 - m.pct}% игроков на ${p.hero}.`
  }
  if (part === 'lane') {
    const l = p.score_parts!.lane!
    const where = l.lane ? ` (${LANE_NAMES[l.lane]})` : ''
    const out = l.outcome ? `Линия${where} ${OUTCOME_NAMES[l.outcome]}` : `Линия${where}`
    const gd = l.gold_diff_10 != null ? `, на 10-й минуте ${signed(l.gold_diff_10)} золота к прямому сопернику` : ''
    return `${out}${gd}.`
  }
  if (part === 'deaths') {
    const d = p.score_parts!.deaths!
    const costly = d.details.filter((x) => x.tags.some((t) => t.startsWith('после смерти'))).length
    const late = d.details.filter((x) => x.minute >= 25).length
    const worse = d.deaths_pct != null ? ` — больше, чем у ${100 - d.deaths_pct}% игроков на ${p.hero}` : ''
    const extra = costly ? `; после ${costly} из них команда потеряла здание или Рошана` : late ? `; ${late} — после 25-й минуты` : ''
    return `${d.deaths} смертей${worse}${extra}.`
  }
  if (part === 'fights') {
    const f = p.score_parts!.fights!
    const eff = f.gold_share > f.damage_share
      ? `; забрал ${f.gold_share}% золота команды, а урона дал ${f.damage_share}%`
      : ''
    return `Участие в драках команды — ${f.participation}%${eff}.`
  }
  const r = p.score_parts!.role!
  if ((p.position ?? 0) >= 4) {
    return `${r.wards} вардов за ${minutes} мин, снято вражеских — ${r.dewards}, стаков — ${r.stacks}.`
  }
  if (p.position === 3) {
    return `Станы ${String(r.stuns_sec).replace('.', ',')} с (${r.stun_share}% команды), принял ${r.damage_taken_share}% урона от героев.`
  }
  return `Урон по зданиям ${fmt(r.tower_damage)} (${r.tower_share}% команды)${r.roshan_kills ? '' : ', Рошана не добивал'}.`
}

// Три части, которые сильнее всего потянули балл вверх (вес × насколько хуже среднего).
export function topParts(p: Player): PartKey[] {
  const w = WEIGHTS[p.position ?? 5]
  return (Object.keys(w) as PartKey[])
    .filter((k) => p.score_parts?.[k])
    .map((k) => ({ k, v: w[k] * (p.score_parts![k]!.score - 40) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.k)
}

export function reasonsFor(p: Player, minutes: number): string[] {
  return topParts(p).map((k) => reasonText(p, k, minutes)).filter((x): x is string => !!x)
}

const ADVICE: Record<PartKey, (pos: number) => string> = {
  hero: (pos) => pos <= 3
    ? 'Больше фарма между драками: не стойте без дела, после каждой драки возвращайтесь на линию или в лес.'
    : 'Чаще участвуйте в убийствах: держитесь рядом с корами и помогайте им, а не ходите по карте в одиночку.',
  lane: () => 'Разберите свою линию: сколько крипов вы добили и отдали к 10-й минуте. Если вас прессуют — зовите мида или саппорта и не теряйте опыт под вышкой.',
  deaths: () => 'Меньше смертей без размена, особенно после 25-й минуты: перед выходом проверьте, где враги, и держите золото на выкуп.',
  fights: (pos) => pos <= 3
    ? 'Заходите в драки вместе с командой и отдавайте урон: золото, которое вы забрали, должно превращаться в урон.'
    : 'Будьте рядом с командой во время драк — много драк прошло без вас.',
  role: (pos) => pos >= 4
    ? 'Ставьте варды постоянно (примерно один каждые 3 минуты), снимайте вражеские и стакайте лагеря для своих коров.'
    : pos === 3
      ? 'Берите урон и контроль на себя: начинайте драки, а не стойте за спинами.'
      : 'Дожимайте здания после выигранных драк — урон по башням и Рошан решают игры.',
}

export function adviceFor(a: Analysis, culprit: Player | null): string {
  const v = a.verdict
  if (v && (v.kind === 'leaver' || v.kind === 'feeder')) {
    return v.kind === 'leaver'
      ? 'Если нужно уйти — лучше не начинать игру: выход почти всегда стоит команде победы. Остальным: при ливере не сдавайтесь сразу, такие игры иногда вытаскивают за счёт затяжной обороны.'
      : 'Намеренный фид — нарушение правил игры: отправьте жалобу (report) на этого игрока в клиенте Dota 2.'
  }
  if (culprit) {
    const part = topParts(culprit)[0]
    if (part) return ADVICE[part](culprit.position ?? 5)
  }
  const t = a.team_report
  if (t) {
    if (t.lanes.lost >= 2) return 'Команда проиграла линии: договоритесь о линиях на стадии выбора героев и чаще помогайте самой тяжёлой линии в первые 10 минут.'
    if (t.fights.lost > t.fights.won) return 'Команда проигрывала драки: собирайтесь впятером перед драками за объекты и не заходите по одному.'
    if (t.roshans.theirs > t.roshans.ours) return 'Соперник забирал Рошана: ставьте варды у логова заранее и не отдавайте его без драки.'
  }
  return 'Проиграли командой: в следующей игре договоритесь о плане на середину игры — когда собираетесь вместе и какие объекты забираете.'
}

// Минуты/секунды для ключевых эпизодов
export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.max(0, t % 60)).padStart(2, '0')}`
