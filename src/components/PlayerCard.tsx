import type { PartKey, Player } from '../types'
import { PART_NAMES, POSITION_NAMES, metricName } from '../explain'
import { Bar, HeroIcon, Items, scoreText } from './ui'

const PARTS: PartKey[] = ['hero', 'lane', 'deaths', 'fights', 'role']

export function PlayerCard({ p, culprit }: { p: Player; culprit: boolean }) {
  const metrics = p.score_parts?.hero?.metrics ?? []
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

      {p.score_parts && (
        <div className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-x-2 gap-y-1 text-xs">
          {PARTS.map((k) => {
            const s = p.score_parts?.[k]?.score
            return s == null ? null : [
              <span key={`${k}n`} className="text-slate-400">{PART_NAMES[k]}</span>,
              <Bar key={`${k}b`} value={s} />,
              <span key={`${k}v`} className="text-right tabular-nums text-slate-300">{s}</span>,
            ]
          })}
        </div>
      )}

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
