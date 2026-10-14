import { useState } from 'react'
import type { Analysis, Player, Side } from '../types'
import { LANE_NAMES, OUTCOME_NAMES, adviceFor, mmss, reasonsFor } from '../explain'
import { GameChart } from './GameChart'
import { PlayerCard } from './PlayerCard'
import { Disagree } from './Disagree'
import { Glossary } from './Glossary'
import { FarmMap } from './FarmMap'
import { ChatBlock } from './ChatBlock'
import { HeroIcon, Section } from './ui'
import { makeShareImage, shareOrDownload } from '../shareImage'

const FLAG_TEXT: Record<string, string> = {
  turbo: 'Турбо: сравниваем с нормами Турбо',
  not_parsed: 'Неполный разбор: OpenDota не разобрала запись матча',
  no_stratz: 'Без Stratz: позиции и итоги линий по данным OpenDota',
  positions_from_opendota: 'Позиции определены по линии и золоту',
  position_uncertain: 'Позиция неточная у части игроков',
}

export function Report({ data, onRefresh }: { data: Analysis; onRefresh: () => void }) {
  if (data.status === 'rejected' && !data.players) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-slate-900 p-5 ring-1 ring-slate-800">
          <div className="text-lg font-semibold">Этот матч не оцениваем</div>
          <div className="mt-1 text-slate-300">{data.message}</div>
        </div>
        <Links data={data} />
      </div>
    )
  }
  const players = data.players ?? []
  const loser = data.match!.losing_side
  const losers = players.filter((p) => p.lost).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const winners = players.filter((p) => !p.lost).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const bySlot = new Map(players.map((p) => [p.slot, p]))
  const v = data.verdict
  const culpritSlots = !v ? [] : 'slots' in v ? v.slots : [v.slot]
  const culprits = culpritSlots.map((s) => bySlot.get(s)).filter((p): p is Player => !!p)
  const minutes = data.match!.duration_min

  return (
    <div className="flex flex-col gap-4">
      <VerdictBlock data={data} culprits={culprits} onRefresh={onRefresh} />

      {data.status === 'ready' && v && (v.kind === 'main' || v.kind === 'two') && (
        <Section title={v.kind === 'main' ? 'Три главные причины' : 'Главные причины'}>
          <div className="flex flex-col gap-4">
            {culprits.map((p) => (
              <div key={p.slot} className="flex gap-3">
                <HeroIcon heroKey={p.hero_key} name={p.hero} className="h-8 w-14" />
                <div className="min-w-0">
                  {culprits.length > 1 && <div className="mb-1 font-semibold">{p.name} ({p.hero})</div>}
                  <ol className="list-decimal space-y-1 pl-5 text-slate-200">
                    {reasonsFor(p, minutes).slice(0, culprits.length > 1 ? 2 : 3).map((r) => <li key={r}>{r}</li>)}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {data.status === 'ready' && v?.kind === 'team' && data.team_report && <TeamBlock data={data} />}

      {data.timeline && (
        <Section title="Как развивалась игра">
          <GameChart gold={data.timeline.gold_adv} xp={data.timeline.xp_adv} events={data.timeline.events} loser={loser} />
        </Section>
      )}

      <Lanes data={data} />

      <Section title="Игроки">
        <h3 className="mb-2 text-sm font-semibold text-red-300">Проиграли — {data.match!.losing_side_ru}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {losers.map((p) => <PlayerCard key={p.slot} p={p} culprit={culpritSlots.includes(p.slot)} minutes={data.match!.duration_min} />)}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold text-emerald-300">Победили — для сравнения</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {winners.map((p) => <PlayerCard key={p.slot} p={p} culprit={false} minutes={data.match!.duration_min} />)}
        </div>
        <Glossary />
      </Section>

      {players.some((p) => p.heat?.length || p.route?.length) && (
        <Section title="Карта: где фармил и как ходил">
          <FarmMap players={[...losers, ...winners]} initial={culpritSlots[0] ?? losers[0]?.slot ?? null} />
        </Section>
      )}

      {data.chat && (
        <Section title="Чат и настроение">
          <ChatBlock chat={data.chat} players={players} loserRu={data.match!.losing_side_ru} />
        </Section>
      )}

      <Episodes data={data} loser={loser} />

      {data.status === 'ready' && (
        <Section title="Что сделать в следующей игре">
          <p className="text-slate-200">{adviceFor(data, v && v.kind !== 'team' ? culprits[0] ?? null : null)}</p>
        </Section>
      )}

      <Links data={data} />

      {data.status === 'ready' && v && (
        <Section title="Не согласен с вердиктом">
          <Disagree matchId={data.match_id} losers={losers} />
        </Section>
      )}
    </div>
  )
}

function VerdictBlock({ data, culprits, onRefresh }: { data: Analysis; culprits: Player[]; onRefresh: () => void }) {
  const v = data.verdict
  const m = data.match!
  const [copied, setCopied] = useState(false)
  const [img, setImg] = useState<'idle' | 'busy' | 'error'>('idle')
  const shareImg = async () => {
    setImg('busy')
    try { await shareOrDownload(await makeShareImage(data, culprits), data.match_id); setImg('idle') } catch { setImg('error') }
  }
  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* нет доступа к буферу */ }
  }
  const tone = !v ? 'ring-slate-700' : v.kind === 'team' ? 'ring-sky-700 bg-sky-950/30' : 'ring-red-700 bg-red-950/40'
  return (
    <section className={`rounded-xl p-4 ring-1 sm:p-6 ${tone} ${!v ? 'bg-slate-900' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>Матч {data.match_id}</span>
        <span>{m.game_mode_name}</span>
        <span>{m.duration_min} мин</span>
        <span>
          <span className="text-emerald-300">Свет {m.score.radiant}</span> : <span className="text-red-300">{m.score.dire} Тьма</span>
        </span>
        <span>победили {m.radiant_win ? 'Силы Света' : 'Силы Тьмы'}</span>
      </div>

      {data.status === 'rejected' ? (
        <>
          <div className="text-xl font-bold sm:text-2xl">Этот матч не оцениваем</div>
          <div className="mt-1 text-slate-300">{data.message}</div>
        </>
      ) : v ? (
        <div className="flex items-start gap-4">
          {culprits.length > 0 && (
            <div className="hidden shrink-0 flex-col gap-1 sm:flex">
              {culprits.map((p) => <HeroIcon key={p.slot} heroKey={p.hero_key} name={p.hero} className="h-12 w-20" />)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold leading-snug sm:text-2xl">{v.text}</div>
            {'confidence' in v && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-slate-300">
                  Уверенность <b className="text-white">{v.confidence}%</b> <span className="text-slate-500">— из чего сложилась</span>
                </summary>
                <ul className="mt-2 space-y-0.5 text-slate-400">
                  {v.confidence_parts.map((c) => (
                    <li key={c.reason}><span className="inline-block w-10 tabular-nums text-slate-200">{c.points > 0 ? `+${c.points}` : c.points}</span>{c.reason}</li>
                  ))}
                </ul>
              </details>
            )}
            {'warnings' in v && v.warnings.includes('imp_disagrees') && (
              <div className="mt-2 rounded bg-amber-900/40 px-2 py-1 text-sm text-amber-200">
                Stratz с нами не согласен: по его оценке (IMP) этот игрок — лучший в команде.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xl font-bold">Данные собраны, но вердикт посчитать не удалось</div>
      )}

      {(data.flags?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.flags!.filter((f) => FLAG_TEXT[f]).map((f) => (
            <span key={f} className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">{FLAG_TEXT[f]}</span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <button onClick={shareImg} disabled={img === 'busy'} className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-900 hover:bg-white disabled:opacity-50">
          {img === 'busy' ? 'Готовим…' : img === 'error' ? 'Не получилось, ещё раз' : 'Картинка для друзей'}
        </button>
        <button onClick={share} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-600 hover:bg-slate-800">{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
        <button onClick={onRefresh} className="rounded-lg px-3 py-1.5 text-slate-400 ring-1 ring-slate-700 hover:bg-slate-800" title="Пересчитать без кеша">Пересчитать</button>
      </div>
    </section>
  )
}

function TeamBlock({ data }: { data: Analysis }) {
  const t = data.team_report!
  const fmt = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU')}`)
  const rows: [string, string, boolean][] = [
    ['Линии', `выиграно ${t.lanes.won}, проиграно ${t.lanes.lost}${t.lanes.tie ? `, ничьих ${t.lanes.tie}` : ''}`, t.lanes.lost > t.lanes.won],
    ['Золото на 10-й минуте', fmt(t.gold_diff.min10), (t.gold_diff.min10 ?? 0) < 0],
    ['Золото на 20-й минуте', fmt(t.gold_diff.min20), (t.gold_diff.min20 ?? 0) < 0],
    ['Драки', `выиграно ${t.fights.won}, проиграно ${t.fights.lost}`, t.fights.lost > t.fights.won],
    ['Башни', `потеряно ${t.towers_lost}, снесено ${t.towers_taken}`, t.towers_lost > t.towers_taken],
    ['Рошан', `наших ${t.roshans.ours}, у соперника ${t.roshans.theirs}`, t.roshans.theirs > t.roshans.ours],
  ]
  return (
    <Section title="Где команда отстала">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.map(([k, val, bad]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-slate-800 py-1">
            <dt className="text-slate-400">{k}</dt>
            <dd className={bad ? 'text-red-300' : 'text-slate-200'}>{val}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function Lanes({ data }: { data: Analysis }) {
  const players = data.players ?? []
  const loser = data.match!.losing_side
  const rows = (['top', 'mid', 'bot'] as const).map((lane) => {
    const on = players.filter((p) => p.score_parts?.lane?.lane === lane)
    const ours = on.filter((p) => p.side === loser)
    const theirs = on.filter((p) => p.side !== loser)
    const fromStratz = data.lanes?.find((l) => l.lane === lane)?.for_losers ?? null
    const fromScore = ours[0]?.score_parts?.lane?.outcome
    const outcome = fromStratz ?? (fromScore ? OUTCOME_NAMES[fromScore] : null)
    const core = ours.find((p) => p.score_parts?.lane?.gold_diff_10 != null)
    return { lane, ours, theirs, outcome, gd: core?.score_parts?.lane?.gold_diff_10 ?? null }
  })
  if (rows.every((r) => !r.ours.length && !r.theirs.length)) return null
  const tone = (o: string | null) => (!o ? 'text-slate-400' : /разгром$|проиграна|разгромлена/.test(o) ? 'text-red-300' : /выиграна|пользу/.test(o) ? 'text-emerald-300' : 'text-slate-200')
  return (
    <Section title="Линии">
      <div className="divide-y divide-slate-800">
        {rows.map((r) => (
          <div key={r.lane} className="grid grid-cols-[3rem_1fr] items-center gap-2 py-2.5 sm:grid-cols-[4rem_1fr_1fr_10rem]">
            <div className="font-semibold capitalize">{LANE_NAMES[r.lane]}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.ours.map((p) => <HeroIcon key={p.slot} heroKey={p.hero_key} name={`${p.hero} (${p.name})`} className="h-7 w-12" />)}
              <span className="px-1 text-xs text-slate-500">против</span>
              {r.theirs.map((p) => <HeroIcon key={p.slot} heroKey={p.hero_key} name={`${p.hero} (${p.name})`} className="h-7 w-12" />)}
            </div>
            <div className={`col-start-2 text-sm sm:col-start-auto ${tone(r.outcome)}`}>{r.outcome ? `Линия ${r.outcome}` : 'Итог неизвестен'}</div>
            <div className="col-start-2 text-sm text-slate-400 sm:col-start-auto sm:text-right">
              {r.gd != null ? <>10-я мин: <span className={r.gd < 0 ? 'text-red-300' : 'text-emerald-300'}>{r.gd > 0 ? '+' : ''}{r.gd.toLocaleString('ru-RU')}</span> золота</> : ''}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Слева — проигравшая команда. Разница золота — у кора линии против прямого соперника.</p>
    </Section>
  )
}

type Episode = { t: number; text: string; tone: 'bad' | 'good' | 'neutral' }

function Episodes({ data, loser }: { data: Analysis; loser: Side }) {
  const [all, setAll] = useState(false)
  const list: Episode[] = []
  for (const p of data.players ?? []) {
    if (!p.lost) continue
    for (const d of p.score_parts?.deaths?.details ?? []) {
      if (d.weight < 1.5) continue
      const tags = d.tags.filter((t) => !t.startsWith('размен'))
      list.push({
        t: d.minute * 60,
        tone: 'bad',
        text: `${p.name} (${p.hero}) погиб${d.gold_lost ? `, потеряно ${d.gold_lost} золота` : ''}${tags.length ? ` — ${tags.join(', ')}` : ''}`,
      })
    }
  }
  for (const e of data.timeline?.events ?? []) {
    if (e.type === 'fight' && e.winner && e.winner !== loser) {
      const enemy = loser === 'radiant' ? 'dire' : 'radiant'
      list.push({ t: e.t, tone: 'bad', text: `Проигранная драка: потери ${e.deaths[loser]} против ${e.deaths[enemy]}` })
    }
    if (e.type === 'building' && e.lost === loser) list.push({ t: e.t, tone: 'bad', text: `Потеряно здание: ${e.name}` })
    if (e.type === 'roshan') list.push({ t: e.t, tone: e.team === loser ? 'good' : 'bad', text: e.team === loser ? 'Забрали Рошана' : 'Соперник забрал Рошана' })
  }
  if (!list.length) return null
  list.sort((a, b) => a.t - b.t)
  const shown = all ? list : list.slice(0, 12)
  return (
    <Section title="Ключевые эпизоды">
      <ol className="space-y-1.5 text-sm">
        {shown.map((e, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-12 shrink-0 tabular-nums text-slate-500">{mmss(e.t)}</span>
            <span className={e.tone === 'bad' ? 'text-slate-200' : 'text-emerald-300'}>{e.text}</span>
          </li>
        ))}
      </ol>
      {list.length > 12 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-sm text-slate-400 hover:text-slate-200">
          {all ? 'Свернуть' : `Показать все (${list.length})`}
        </button>
      )}
    </Section>
  )
}

function Links({ data }: { data: Analysis }) {
  return (
    <Section title="Матч на других сайтах">
      <div className="flex flex-wrap gap-2 text-sm">
        {([['OpenDota', data.links.opendota], ['Stratz', data.links.stratz], ['Dotabuff', data.links.dotabuff]] as const).map(([n, href]) => (
          <a key={n} href={href} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 ring-1 ring-slate-600 hover:bg-slate-800">{n} ↗</a>
        ))}
      </div>
    </Section>
  )
}
