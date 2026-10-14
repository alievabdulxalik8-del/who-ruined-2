import { useState } from 'react'
import { sendFeedback } from '../api'
import type { Player } from '../types'
import { HeroIcon } from './ui'

// Кнопка «Не согласен»: пользователь отмечает, кто, на его взгляд, проиграл игру.
// Ответы потом помогают подбирать веса формулы.
export function Disagree({ matchId, losers }: { matchId: number; losers: Player[] }) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<number | null | undefined>(undefined)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  if (state === 'done') return <div className="text-sm text-emerald-300">Спасибо! Ваш ответ поможет точнее оценивать матчи.</div>
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-600 hover:bg-slate-800">
        Не согласен с вердиктом
      </button>
    )
  }
  const send = async () => {
    setState('sending')
    try {
      await sendFeedback(matchId, choice ?? null, comment)
      setState('done')
    } catch (e) {
      setError((e as Error).message)
      setState('error')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-300">Кто, по-вашему, проиграл эту игру?</div>
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
        rows={2}
        placeholder="Почему? (необязательно)"
        className="rounded-lg bg-slate-950 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-red-500"
      />
      {state === 'error' && <div className="text-sm text-red-300">{error}</div>}
      <div className="flex gap-2">
        <button
          disabled={choice === undefined || state === 'sending'}
          onClick={send}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {state === 'sending' ? 'Отправляем…' : 'Отправить'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Отмена</button>
      </div>
    </div>
  )
}
