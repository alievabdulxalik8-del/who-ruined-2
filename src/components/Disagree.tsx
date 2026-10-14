import { useState } from 'react'
import { sendFeedback } from '../api'
import type { Player } from '../types'
import { HeroIcon } from './ui'

// «Не согласен»: форма открыта сразу. Можно выбрать, кто, на ваш взгляд, проиграл игру, и/или своими словами
// описать, как было на самом деле. Ответы потом помогают подбирать веса формулы.
export function Disagree({ matchId, losers }: { matchId: number; losers: Player[] }) {
  const [choice, setChoice] = useState<number | null | undefined>(undefined)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  if (state === 'done') return <div className="text-sm text-emerald-300">Спасибо! Ваш ответ поможет точнее оценивать матчи.</div>
  const send = async () => {
    setState('sending')
    try {
      // Только описание без выбора игрока — помечаем, чтобы не спутать с «проиграли командой»
      const text = choice === undefined ? `[без выбора] ${comment.trim()}` : comment.trim()
      await sendFeedback(matchId, choice ?? null, text)
      setState('done')
    } catch (e) {
      setError((e as Error).message)
      setState('error')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-300">Не согласны? Отметьте, кто, по-вашему, проиграл игру, и/или опишите, как было на самом деле.</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {losers.map((p) => (
          <label key={p.slot} className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 ring-1 ${choice === p.slot ? 'bg-slate-800 ring-red-500' : 'ring-slate-700'}`}>
            <input type="radio" name="who" className="accent-red-500" checked={choice === p.slot} onChange={() => setChoice(p.slot)} />
            <HeroIcon heroKey={p.hero_key} name={p.hero} className="h-6 w-10" />
            <span className="truncate text-sm">{p.name} <span className="text-slate-400">({p.hero})</span></span>
          </label>
        ))}
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 ring-1 ${choice === null ? 'bg-slate-800 ring-red-500' : 'ring-slate-700'}`}>
          <input type="radio" name="who" className="accent-red-500" checked={choice === null} onChange={() => setChoice(null)} />
          <span className="text-sm">Проиграли командой</span>
        </label>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={4}
        placeholder="Как было на самом деле: например, «керри фармил лес с 15-й минуты и не пришёл ни на одну драку, саппорт ушёл в AFK на 30-й»"
        className="rounded-lg bg-slate-950 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-red-500"
      />
      {state === 'error' && <div className="text-sm text-red-300">{error}</div>}
      <div className="flex gap-2">
        <button
          disabled={(choice === undefined && comment.trim().length < 5) || state === 'sending'}
          onClick={send}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {state === 'sending' ? 'Отправляем…' : 'Отправить'}
        </button>
      </div>
    </div>
  )
}
