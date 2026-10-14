// Раскрывающееся объяснение под каждой полоской: что учитывается и цифры этого игрока.
import type { PartKey, Player } from './types'
import { LANE_NAMES, OUTCOME_NAMES, metricName } from './explain'

export type PartDetails = { how: string; lines: string[] }

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
const num = (n: number) => String(n).replace('.', ',')
const NOTE = 'К итогу части добавлена небольшая поправка на позицию: так части у разных позиций сравнимы.'

export function partDetails(p: Player, k: PartKey, minutes: number): PartDetails | null {
  const sp = p.score_parts
  const pos = p.position ?? 5
  if (k === 'hero' && sp?.hero) {
    const h = sp.hero
    return {
      how: `Показатели сравниваются со всеми, кто играл на ${p.hero}. Балл = 100 − средний процент «лучше, чем у X% игроков». ${NOTE}`,
      lines: [
        ...h.metrics.map((m) => `${metricName(m.key)}: ${m.raw >= 100 ? fmt(m.raw) : num(m.raw)} — лучше, чем у ${m.pct}%${m.counted != null ? ` (засчитано ${m.counted}%)` : ''}`),
        ...(h.farm_ignored ? ['Фарм засчитан не выше 50%: игрок пропустил половину и больше проигранных драк.'] : []),
      ],
    }
  }
  if (k === 'lane' && sp?.lane) {
    const l = sp.lane
    return {
      how: 'Итог линии по Stratz (разгром −, проигрыш, ничья, победа) — 60%. Корам ещё 40% — разница золота с прямым соперником на 10-й минуте: −1500 золота даёт 100, +1500 — 0.',
      lines: [
        `Линия: ${l.lane ? LANE_NAMES[l.lane] : 'не определена'}${l.outcome ? `, ${OUTCOME_NAMES[l.outcome]}` : ''}`,
        ...(l.gold_diff_10 != null ? [`Золото к сопернику на 10-й минуте: ${signed(l.gold_diff_10)}`] : []),
      ],
    }
  }
  if (k === 'deaths' && sp?.deaths) {
    const d = sp.deaths
    return {
      how: 'Сколько раз умер по сравнению с нормой для героя. Смерти до 10-й минуты весят 0,7, после 25-й — 1,5; если после смерти команда за минуту потеряла здание или Рошана — ×1,5; если драку при этом выиграли (размен) — ×0,5.',
      lines: [
        `Смертей: ${d.deaths}${d.deaths_pct != null ? ` — умирал реже, чем ${d.deaths_pct}% игроков на ${p.hero}` : ''}`,
        ...(d.avg_weight != null ? [`Средний вес смерти: ${num(d.avg_weight)} (1 — обычная)`] : []),
        ...(d.details.length ? [`Минуты: ${d.details.map((x) => `${x.minute}${x.weight >= 1.5 ? '!' : ''}`).join(', ')} (! — дорогая смерть)`] : []),
      ],
    }
  }
  if (k === 'fights' && sp?.fights) {
    const f = sp.fights
    const away = f.lost_fights != null
    return {
      how: away
        ? 'Три части: участие в убийствах команды — 35%; окупился ли фарм (доля золота команды против доли урона) — 30%; пропущенные проигранные драки — 35%, пропуск драки, где команда была в меньшинстве, весит в 1,5 раза больше.'
        : 'Две части поровну: участие в убийствах команды и окупился ли фарм (доля золота команды против доли урона).',
      lines: [
        `Участие в убийствах команды: ${f.participation}%`,
        `Доля золота команды: ${f.gold_share}%, доля урона${pos >= 4 ? ' и лечения' : ''}: ${f.damage_share}%`,
        ...(away ? [`Проигранных драк: ${f.lost_fights}, без него: ${f.absent_lost ?? 0}${f.absent_outnumbered ? `, из них в меньшинстве: ${f.absent_outnumbered}` : ''}`] : []),
      ],
    }
  }
  if (k === 'role' && sp?.role) {
    const r = sp.role
    const m = Math.max(1, minutes)
    if (pos >= 4) {
      return {
        how: `Варды — 35% (норма ${pos === 5 ? '1 за 2,5 мин' : '1 за 4 мин'}), сколько простояли обсерверы — 25% (норма 4 мин), снятые вражеские варды — 25% (норма 1 за 17 мин), стаки — 15% (норма 1 за 20 мин).`,
        lines: [
          `Вардов: ${r.wards} (норма за ${minutes} мин ≈ ${Math.round((pos === 5 ? 0.4 : 0.25) * m)})`,
          ...(r.obs_avg_life_sec != null ? [`Обсервер стоял в среднем: ${Math.floor(r.obs_avg_life_sec / 60)}:${String(r.obs_avg_life_sec % 60).padStart(2, '0')}`] : []),
          `Снято вражеских: ${r.dewards} (норма ≈ ${Math.round(0.06 * m)})`,
          `Стаков: ${r.stacks} (норма ≈ ${Math.round(0.05 * m)})`,
        ],
      }
    }
    if (pos === 3) {
      return {
        how: 'Станы — 50%, принятый урон от героев — 50%. Норма — четверть от всей команды по каждому.',
        lines: [`Станы: ${num(r.stuns_sec)} с — ${r.stun_share}% команды`, `Принял урона от героев: ${r.damage_taken_share}% команды`],
      }
    }
    return {
      how: `Урон по зданиям — 80% (норма ${pos === 1 ? '30' : '20'}% урона команды), добил Рошана хотя бы раз — 20%.`,
      lines: [`Урон по зданиям: ${fmt(r.tower_damage)} — ${r.tower_share}% команды`, `Рошанов добил: ${r.roshan_kills}`],
    }
  }
  return null
}
