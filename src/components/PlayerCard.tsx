import { useState } from 'react'
import type { PartKey, Player } from '../types'
import { PART_NAMES, POSITION_NAMES, metricName } from '../explain'
import { partDetails } from '../partDetails'
import { Bar, HeroIcon, Items, scoreText } from './ui'

const PARTS: PartKey[] = ['hero', 'lane', 'deaths', 'fights', 'role']

export function PlayerCard({ p, culprit, minutes }: { p: Player; culprit: boolean; minutes: number }) {
  const metrics = p.score_parts?.hero?.metrics ?? []
  const [open, setOpen] = useState<PartKey | null>(null)
  return (
    <div className={`flex flex-col gap-3 rounded-xl p-3 ring-1 ${culprit ? 'bg-red-950/40 ring-red-700' : 'bg-slate-900 ring-slate-800'}`}>
      <div className="flex items-center gap-3">
        <HeroIcon heroKey={p.hero_key} name={p.hero} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" title={p.name}>{p.name}</div>
          <div className="text-xs text-slate-400">
            {p.hero}
            {p.position ? ` · pos ${p.position} ${POSITION_NAMES[p.position]}` : ''}
            {p.position_uncertain && <span className="text-amber-400" title={p.position_notes.join('; ')}> · позиция неточная</span>}
          </div>
        </div>
        {p.score != null && (
          <div className="text-right">
            <div className={`text-2xl font-bold leading-none ${scoreText(p.score)}`}>{p.score}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">балл вины</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
        <span>KDA <b>{p.kda}</b></span>
        <span>GPM <b>{p.gpm}</b></span>
        <span>XPM <b>{p.xpm}</b></span>
        {p.net_worth != null && <span>Ценность <b>{p.net_worth.toLocaleString('ru-RU')}</b></span>}
        {p.imp != null && <span title="Собственная оценка игры от Stratz: выше ноля — лучше среднего">IMP <b>{p.imp > 0 ? `+${p.imp}` : p.imp}</b></span>}
      </div>

      {p.leaver && <div className="rounded bg-red-900/50 px-2 py-1 text-xs text-red-200">Вышел из игры{p.leaver.minute != null ? ` на ${p.leaver.minute}-й минуте` : ''}: {p.leaver.text}</div>}
      {p.intentional_feeding && <div className="rounded bg-red-900/50 px-2 py-1 text-xs text-red-200">Stratz отметил намеренный фид</div>}

      {p.score_parts && <div className="-mb-1 text-[11px] text-slate-500">Полоски — вина по частям: длиннее и краснее — хуже. Нажмите, чтобы увидеть, как считается</div>}
      {p.score_parts && (
        <div className="flex flex-col gap-1 text-xs">
          {PARTS.map((k) => {
            const s = p.score_parts?.[k]?.score
            if (s == null) return null
            const isOpen = open === k
            const d = isOpen ? partDetails(p, k, minutes) : null
            return (
              <div key={k}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : k)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[4.5rem_1fr_2rem_0.75rem] items-center gap-x-2 py-0.5 text-left"
                >
                  <span className="text-slate-400">{PART_NAMES[k]}</span>
                  <Bar value={s} />
                  <span className="text-right tabular-nums text-slate-300">{s}</span>
                  <span className="text-slate-500">{isOpen ? '▴' : '▾'}</span>
                </button>
                {d && (
                  <div className="mt-1 rounded bg-slate-800/70 px-2 py-1.5 text-[11px] leading-snug text-slate-300">
                    <p className="text-slate-400">{d.how}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {d.lines.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {p.score_parts?.hero?.farm_ignored && (
        <div className="rounded bg-amber-900/40 px-2 py-1 text-xs text-amber-200">Фарм не засчитан: пропустил половину и больше проигранных драк</div>
      )}
      {(p.score_parts?.fights?.absent_lost ?? 0) > 0 && (
        <div className="text-xs text-slate-400">
          Не было в {p.score_parts!.fights!.absent_lost} из {p.score_parts!.fights!.lost_fights} проигранных драк
          {p.score_parts!.fights!.absent_outnumbered ? ` (в меньшинстве — ${p.score_parts!.fights!.absent_outnumbered})` : ''}
        </div>
      )}

      {metrics.length > 0 && <div className="-mb-1 text-[11px] text-slate-500">Плашки — лучше, чем у X% игроков на этом герое: больше — лучше</div>}
      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {metrics.map((m) => (
            <span
              key={m.key}
              title={`${metricName(m.key)}: ${m.raw} — лучше, чем у ${m.pct}% игроков на ${p.hero}`}
              className={`rounded px-1.5 py-0.5 text-[11px] ${m.pct < 25 ? 'bg-red-900/60 text-red-200' : m.pct < 50 ? 'bg-amber-900/50 text-amber-200' : 'bg-emerald-900/50 text-emerald-200'}`}
            >
              {metricName(m.key)}: {m.pct}%
            </span>
          ))}
        </div>
      )}

      <Items items={p.items ?? []} />
    </div>
  )
}
