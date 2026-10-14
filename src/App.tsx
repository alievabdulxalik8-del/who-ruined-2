import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeMatch, recentMatches } from './api'
import type { Analysis, Parsing, RecentMatch } from './types'
import { Report } from './components/Report'
import { RecentList } from './components/RecentList'

type Mode = 'match' | 'player'
type State =
  | { kind: 'idle' }
  | { kind: 'loading'; text: string }
  | { kind: 'parsing'; info: Parsing; since: number }
  | { kind: 'report'; data: Analysis }
  | { kind: 'recent'; accountId: number; matches: RecentMatch[] }
  | { kind: 'error'; text: string }

const MAX_WAIT_MS = 5 * 60_000 // сервер сам сдаётся через 4 минуты, это запас

// Ссылку на страницу можно отправить другу: ?match=… или ?player=…
function readUrl(): { mode: Mode; value: string } | null {
  const q = new URLSearchParams(location.search)
  if (q.get('match')) return { mode: 'match', value: q.get('match')! }
  if (q.get('player')) return { mode: 'player', value: q.get('player')! }
  return null
}
function writeUrl(mode: Mode, value: string) {
  const url = new URL(location.href)
  url.search = value ? `?${mode}=${encodeURIComponent(value)}` : ''
  history.pushState(null, '', url)
}

// Из ссылки достаём число, чтобы адрес страницы был коротким
const matchIdFrom = (s: string) => s.match(/matches?\/(\d{6,12})/i)?.[1] ?? s.trim()

export default function App() {
  const initial = readUrl()
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'match')
  const [input, setInput] = useState(initial?.value ?? '')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const timer = useRef<number>()
  const run = useRef(0) // номер запроса: ответы на старые запросы игнорируем

  // since/id передаются только при повторной проверке во время разбора
  const loadMatch = useCallback(async (value: string, refresh = false, poll?: { since: number; id: number }) => {
    window.clearTimeout(timer.current)
    const since = poll?.since ?? Date.now()
    const id = poll?.id ?? ++run.current
    if (!poll) setState({ kind: 'loading', text: 'Собираем данные матча…' })
    try {
      const data = await analyzeMatch(value, refresh)
      if (id !== run.current) return
      if (data.status === 'parsing') {
        if (Date.now() - since > MAX_WAIT_MS) {
          setState({ kind: 'error', text: 'Разбор матча затянулся. Попробуйте открыть страницу ещё раз через пару минут.' })
          return
        }
        setState({ kind: 'parsing', info: data, since })
        timer.current = window.setTimeout(() => loadMatch(value, false, { since, id }), (data.retry_after_sec || 15) * 1000)
        return
      }
      setState({ kind: 'report', data })
    } catch (e) {
      if (id === run.current) setState({ kind: 'error', text: (e as Error).message })
    }
  }, [])

  const loadPlayer = useCallback(async (value: string) => {
    window.clearTimeout(timer.current)
    const id = ++run.current
    setState({ kind: 'loading', text: 'Загружаем последние игры…' })
    try {
      const data = await recentMatches(value)
      if (id === run.current) setState({ kind: 'recent', accountId: data.account_id, matches: data.matches })
    } catch (e) {
      if (id === run.current) setState({ kind: 'error', text: (e as Error).message })
    }
  }, [])

  const go = useCallback((m: Mode, value: string, push = true) => {
    const v = m === 'match' ? matchIdFrom(value) : value.trim()
    if (!v) return
    if (push) writeUrl(m, v)
    if (m === 'match') loadMatch(v)
    else loadPlayer(v)
  }, [loadMatch, loadPlayer])

  // Открыли страницу по ссылке или нажали «назад» в браузере
  useEffect(() => {
    const fromUrl = () => {
      const u = readUrl()
      if (!u) { window.clearTimeout(timer.current); run.current++; setState({ kind: 'idle' }); setInput(''); return }
      setMode(u.mode)
      setInput(u.value)
      go(u.mode, u.value, false)
    }
    fromUrl()
    window.addEventListener('popstate', fromUrl)
    return () => { window.removeEventListener('popstate', fromUrl); window.clearTimeout(timer.current) }
  }, [go])

  const openMatch = (id: number) => { setMode('match'); setInput(String(id)); go('match', String(id)) }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex flex-col gap-4 py-6 sm:py-8">
        <a href={import.meta.env.BASE_URL} className="self-start" onClick={(e) => { e.preventDefault(); writeUrl('match', ''); setInput(''); run.current++; setState({ kind: 'idle' }) }}>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Who Ruined <span className="text-red-500">2.0</span>
          </h1>
          <p className="text-sm text-slate-400">Кто проиграл матч Dota 2 — или проиграли командой</p>
        </a>
        <form
          className="flex flex-col gap-2 rounded-xl bg-slate-900 p-3 ring-1 ring-slate-800 sm:flex-row sm:items-center"
          onSubmit={(e) => { e.preventDefault(); go(mode, input) }}
        >
          <div className="flex shrink-0 rounded-lg bg-slate-800 p-1 text-sm">
            {(['match', 'player'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
              >
                {m === 'match' ? 'Матч' : 'Профиль'}
              </button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'match'
              ? 'Match ID или ссылка на OpenDota, Dotabuff, Stratz'
              : 'Steam ID, Friend ID или ссылка на профиль Steam'}
            className="min-w-0 flex-1 rounded-lg bg-slate-950 px-3 py-2.5 text-base outline-none ring-1 ring-slate-700 placeholder:text-slate-500 focus:ring-red-500"
          />
          <button className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-500 active:bg-red-700">
            {mode === 'match' ? 'Разобрать' : 'Показать игры'}
          </button>
        </form>
      </header>

      {state.kind === 'idle' && <Intro />}
      {state.kind === 'loading' && <Spinner text={state.text} />}
      {state.kind === 'parsing' && (
        <Spinner
          text={state.info.message}
          sub={`${state.info.waiting_for?.includes('stratz') && !state.info.waiting_for?.includes('opendota')
            ? 'Ждём Stratz: он определяет позиции и итоги линий. '
            : 'OpenDota разбирает запись матча. '}Прошло ${Math.round((Date.now() - state.since) / 1000)} с, страница обновится сама.`}
        />
      )}
      {state.kind === 'error' && <ErrorBox text={state.text} />}
      {state.kind === 'recent' && <RecentList matches={state.matches} onOpen={openMatch} />}
      {state.kind === 'report' && <Report data={state.data} onRefresh={() => loadMatch(String(state.data.match_id), true)} />}
      <footer className="mt-10 text-center text-[11px] text-slate-600">Версия сайта от {__BUILD__}</footer>
    </div>
  )
}

function Intro() {
  return (
    <section className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
      {[
        ['Сравниваем по-честному', 'Каждого игрока — с другими игроками на том же герое и той же позиции, а не с придуманными нормами.'],
        ['Не ищем виноватого любой ценой', 'Если никто заметно не выделяется, честно пишем «проиграли командой» и показываем, где команда отстала.'],
        ['Ливеры — сразу', 'Если кто-то вышел из игры или фидил, это главный вердикт без всяких формул.'],
      ].map(([t, d]) => (
        <div key={t} className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
          <div className="mb-1 font-semibold text-slate-100">{t}</div>
          <div>{d}</div>
        </div>
      ))}
    </section>
  )
}

function Spinner({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-900 p-5 ring-1 ring-slate-800">
      <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-red-500" />
      <div>
        <div>{text}</div>
        {sub && <div className="text-sm text-slate-400">{sub}</div>}
      </div>
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-xl bg-red-950/60 p-4 text-red-200 ring-1 ring-red-900">{text}</div>
}
