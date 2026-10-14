import { useEffect, useRef, useState } from 'react'
import type { Side, TimelineEvent } from '../types'
import { mmss } from '../explain'

// Поминутная разница золота и опыта с точки зрения проигравшей команды (выше нуля — она впереди)
// и отметки драк, Рошана и зданий под графиком.
export function GameChart({ gold, xp, events, loser }: { gold: number[]; xp: number[] | null; events: TimelineEvent[]; loser: Side }) {
  const sign = loser === 'radiant' ? 1 : -1
  const g = gold.map((v) => v * sign)
  const x = xp?.map((v) => v * sign) ?? null
  // Рисуем в реальную ширину блока, чтобы подписи на телефоне не становились крошечными
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = Math.max(300, width), H = W < 500 ? 200 : 240, L = 42, R = 8, T = 12, B = 22
  const minutes = Math.max(1, g.length - 1)
  const maxAbs = Math.max(1000, ...g.map(Math.abs), ...(x ?? []).map(Math.abs))
  const step = maxAbs > 20000 ? 10000 : maxAbs > 8000 ? 5000 : 2000
  const top = Math.ceil(maxAbs / step) * step
  const sx = (m: number) => L + (m / minutes) * (W - L - R)
  const sy = (v: number) => T + ((top - v) / (2 * top)) * (H - T - B)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('')
  const ticksY = [] as number[]
  for (let v = -top; v <= top; v += step) ticksY.push(v)
  const ticksX = [] as number[]
  for (let m = 0; m <= minutes; m += minutes > 45 || W < 500 ? 10 : 5) ticksX.push(m)
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : String(v))

  const strip = 34 // полоса событий под графиком
  const winnerSide: Side = loser === 'radiant' ? 'dire' : 'radiant'
  return (
    <div ref={box}>
      <svg width={W} height={H + strip} viewBox={`0 0 ${W} ${H + strip}`} className="block max-w-full" role="img" aria-label="Разница золота и опыта по минутам">
        <defs>
          <clipPath id="plot"><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath>
        </defs>
        {/* зоны «впереди / позади» */}
        <rect x={L} y={T} width={W - L - R} height={sy(0) - T} fill="rgb(16 185 129 / 0.06)" />
        <rect x={L} y={sy(0)} width={W - L - R} height={H - B - sy(0)} fill="rgb(239 68 68 / 0.06)" />
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? '#64748b' : '#1e293b'} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{v > 0 ? `+${k(v)}` : k(v)}</text>
          </g>
        ))}
        {ticksX.map((m) => (
          <text key={m} x={sx(m)} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{m}</text>
        ))}
        <g clipPath="url(#plot)">
          {x && <path d={path(x)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="5 4" />}
          <path d={path(g)} fill="none" stroke="#fbbf24" strokeWidth="2.5" />
        </g>
        {/* события */}
        <line x1={L} x2={W - R} y1={H + strip / 2} y2={H + strip / 2} stroke="#1e293b" />
        {events.map((e, i) => {
          const cx = sx(Math.min(minutes, e.t / 60))
          const cy = H + strip / 2
          if (e.type === 'fight') {
            const color = e.winner === loser ? '#10b981' : e.winner === winnerSide ? '#ef4444' : '#94a3b8'
            return (
              <circle key={i} cx={cx} cy={cy} r={4 + Math.min(4, e.deaths.radiant + e.deaths.dire) / 1.5} fill={color} fillOpacity="0.85">
                <title>{`${mmss(e.t)} драка: ${e.winner === loser ? 'выиграна' : e.winner ? 'проиграна' : 'ничья'} (потери ${e.deaths[loser]} : ${e.deaths[winnerSide]})`}</title>
              </circle>
            )
          }
          if (e.type === 'roshan') {
            const color = e.team === loser ? '#10b981' : '#ef4444'
            return (
              <g key={i}>
                <rect x={cx - 6} y={cy - 15} width="12" height="12" rx="2" fill={color} />
                <text x={cx} y={cy - 5.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0f172a">R</text>
                <title>{`${mmss(e.t)} Рошан — ${e.team === loser ? 'наш' : 'у соперника'}`}</title>
              </g>
            )
          }
          const ours = e.lost !== loser // проигравшие снесли здание соперника
          return (
            <path key={i} d={`M${cx},${cy + 3} l5,9 l-10,0 z`} fill={ours ? '#10b981' : '#ef4444'}>
              <title>{`${mmss(e.t)} ${ours ? 'снесли' : 'потеряли'}: ${e.name}`}</title>
            </path>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-amber-400 align-middle" />золото</span>
        {x && <span><span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-sky-400 align-middle" />опыт</span>}
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 align-middle" />драка выиграна</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" />проиграна</span>
        <span>▲ здание (зелёный — снесли, красный — потеряли)</span>
        <span>R — Рошан</span>
      </div>
    </div>
  )
}
