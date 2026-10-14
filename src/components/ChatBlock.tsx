import { useState } from 'react'
import type { Chat, ChatTag, Player } from '../types'
import { mmss } from '../explain'
import { HeroIcon } from './ui'

const TAG: Record<ChatTag, [string, string]> = {
  feed: ['грозит фидить', 'bg-red-900/70 text-red-200'],
  toxic: ['токсично', 'bg-orange-900/60 text-orange-200'],
  blame: ['обвиняет', 'bg-amber-900/50 text-amber-200'],
  give_up: ['сдаётся', 'bg-slate-700 text-slate-200'],
  positive: ['по-доброму', 'bg-emerald-900/50 text-emerald-200'],
}
const times = (n: number) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'раза' : 'раз'}`
const MOOD_TONE: Record<string, string> = {
  'грозились фидить': 'text-red-300', токсичный: 'text-orange-300', сдались: 'text-slate-300',
  напряжённый: 'text-amber-300', дружный: 'text-emerald-300', спокойный: 'text-slate-300',
}

// Чат матча: настроение команд, угрозы фида с проверкой по смертям, сообщения с пометками.
export function ChatBlock({ chat, players, loserRu }: { chat: Chat; players: Player[]; loserRu: string }) {
  const [all, setAll] = useState(false)
  const bySlot = new Map(players.map((p) => [p.slot, p]))
  const flagged = chat.messages.filter((m) => m.tags.some((t) => t !== 'positive'))
  const shown = all ? chat.messages : flagged
  const threats = chat.players.filter((x) => x.feed_check)
  const counts = (t: Chat['losers']) => [
    t.feed && `угрозы фида: ${t.feed}`, t.toxic && `токсичных: ${t.toxic}`, t.blame && `обвинений: ${t.blame}`,
    t.give_up && `сдаться: ${t.give_up}`, t.positive && `добрых: ${t.positive}`,
  ].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        {([['Проигравшие', chat.losers, `(${loserRu})`], ['Победители', chat.winners, '']] as const).map(([name, t, sub]) => (
          <div key={name} className="rounded-lg bg-slate-800/60 px-3 py-2">
            <div className="text-slate-400">{name} {sub}</div>
            <div className={`font-semibold ${MOOD_TONE[t.mood] ?? ''}`}>Настроение: {t.mood}</div>
            {counts(t) && <div className="text-xs text-slate-400">{counts(t)}</div>}
          </div>
        ))}
      </div>

      {threats.map((x) => {
        const p = bySlot.get(x.slot)
        const c = x.feed_check!
        return (
          <div key={x.slot} className={`rounded-lg px-3 py-2 ${c.confirmed ? 'bg-red-950/60 ring-1 ring-red-800' : 'bg-slate-800/60'}`}>
            <b>{p?.name ?? 'Игрок'}</b> ({p?.hero}) на {c.minute}-й минуте написал «{c.text}».{' '}
            {c.confirmed
              ? <span className="text-red-300">После этого умер {times(c.deaths_5min)} за 5 минут (обычно {String(c.usual_5min).replace('.', ',')}) — похоже, правда фидил.</span>
              : <span className="text-slate-300">За следующие 5 минут умер {times(c.deaths_5min)} (обычно {String(c.usual_5min).replace('.', ',')}) — фида по смертям не видно.</span>}
          </div>
        )
      })}

      {shown.length > 0 ? (
        <ol className="space-y-1.5">
          {shown.map((m, i) => {
            const p = bySlot.get(m.slot)
            return (
              <li key={i} className="flex gap-2">
                <span className="w-11 shrink-0 tabular-nums text-slate-500">{mmss(Math.max(0, m.t))}</span>
                <HeroIcon heroKey={p?.hero_key ?? null} name={p ? `${p.hero} (${p.name})` : ''} className="h-5 w-9" />
                <span className="min-w-0 flex-1 break-words">
                  <span className={p?.lost ? 'text-red-300' : 'text-emerald-300'}>{p?.name ?? '?'}:</span>{' '}
                  <span className={m.wheel ? 'italic text-slate-400' : 'text-slate-200'}>{m.text}</span>{' '}
                  {m.tags.map((t) => <span key={t} className={`ml-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] ${TAG[t][1]}`}>{TAG[t][0]}</span>)}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-slate-400">Ничего грубого или тревожного в чате не было.</p>
      )}
      {chat.messages.length > flagged.length && (
        <button onClick={() => setAll(!all)} className="self-start text-slate-400 hover:text-slate-200">
          {all ? 'Только отмеченные' : `Весь чат (${chat.messages.length})`}
        </button>
      )}
      <p className="text-xs text-slate-500">
        Настроение определяем по словам в чате и фразам колеса чата — это подсказка, а не приговор: шутки и сарказм не распознаются.
        Красным — проигравшие, зелёным — победители. Голосовой чат в записи матча не сохраняется.
        Репорты и муты Valve не публикует ни в OpenDota, ни в Stratz — узнать, кто кому кинул репорт, нельзя.
      </p>
    </div>
  )
}
