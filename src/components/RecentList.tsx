import type { RecentMatch } from '../types'
import { HeroIcon, Section } from './ui'

export function RecentList({ matches, onOpen }: { matches: RecentMatch[]; onOpen: (id: number) => void }) {
  return (
    <Section title="Последние игры">
      <p className="mb-3 text-sm text-slate-400">Выберите матч для разбора. Разбираем проигрыши, но можно открыть и победу — посмотреть оценки.</p>
      <ul className="divide-y divide-slate-800">
        {matches.map((m) => (
          <li key={m.match_id}>
            <button onClick={() => onOpen(m.match_id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-800/50">
              <HeroIcon heroKey={m.hero_key} name={m.hero} className="h-8 w-14" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.hero}</div>
                <div className="text-xs text-slate-400">
                  {new Date(m.start_time * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{m.game_mode} · {Math.round(m.duration_sec / 60)} мин · {m.kda}
                </div>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${m.won ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
                {m.won ? 'Победа' : 'Поражение'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
