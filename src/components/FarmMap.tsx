import { useState } from 'react'
import type { Player } from '../types'
import { HeroIcon } from './ui'

// Схема карты в координатах Stratz (64..192 по x и y; Свет — внизу слева, Тьма — вверху справа).
const MIN = 64, SIZE = 128, CELLS = 16
const W = 320
const X = (x: number) => ((x - MIN) / SIZE) * W
const Y = (y: number) => ((MIN + SIZE - y) / SIZE) * W
const pts = (a: [number, number][]) => a.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')

const PHASES = [
  { key: 'all', label: 'Вся игра', from: -Infinity, to: Infinity },
  { key: 'lane', label: '0–10 мин', from: -Infinity, to: 600 },
  { key: 'mid', label: '10–25 мин', from: 600, to: 1500 },
  { key: 'late', label: '25+ мин', from: 1500, to: Infinity },
] as const

// Цвет маршрута по времени: голубой (начало) → жёлтый → красный (конец игры)
function timeColor(f: number) {
  const stops = [[56, 189, 248], [250, 204, 21], [239, 68, 68]]
  const i = f < 0.5 ? 0 : 1
  const k = f < 0.5 ? f * 2 : (f - 0.5) * 2
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * k))
  return `rgb(${c.join(',')})`
}

export function FarmMap({ players, initial }: { players: Player[]; initial: number | null }) {
  const withData = players.filter((p) => (p.heat?.length ?? 0) > 0 || (p.route?.length ?? 0) > 0)
  const [slot, setSlot] = useState<number | null>(initial != null && withData.some((p) => p.slot === initial) ? initial : withData[0]?.slot ?? null)
  const [phase, setPhase] = useState<(typeof PHASES)[number]['key']>('all')
  if (!withData.length) return null
  const p = withData.find((x) => x.slot === slot) ?? withData[0]
  const heat = p.heat ?? []
  const maxGold = Math.max(1, ...heat.map((h) => h[2]))
  const ph = PHASES.find((x) => x.key === phase)!
  const route = (p.route ?? []).filter(([t]) => t >= ph.from && t < ph.to)
  const end = Math.max(1, (p.route ?? []).at(-1)?.[0] ?? 1)
  const cell = W / CELLS
  const total = heat.reduce((s, h) => s + h[2], 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {withData.map((x) => (
          <button
            key={x.slot}
            type="button"
            onClick={() => setSlot(x.slot)}
            className={`rounded ring-2 ${x.slot === p.slot ? 'ring-amber-400' : x.lost ? 'ring-red-900/70' : 'ring-emerald-900/70'}`}
            title={`${x.hero} (${x.name})${x.lost ? ' — проиграл' : ' — победил'}`}
          >
            <HeroIcon heroKey={x.hero_key} name={x.hero} className="h-7 w-12" />
          </button>
        ))}
      </div>
      <div className="text-sm">
        <b>{p.hero}</b> <span className="text-slate-400">({p.name}{p.position ? `, pos ${p.position}` : ''})</span>
        {total > 0 && <span className="text-slate-400"> · золото с крипов {total.toLocaleString('ru-RU')}</span>}
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {PHASES.map((x) => (
          <button key={x.key} type="button" onClick={() => setPhase(x.key)} className={`rounded-md px-2.5 py-1 ${phase === x.key ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${W}`} className="mx-auto block w-full max-w-md rounded-lg" role="img" aria-label="Карта: где игрок фармил и как ходил">
        <rect width={W} height={W} fill="#13261c" />
        {/* реки и линии */}
        <polyline points={pts([[64, 186], [100, 150], [128, 128], [156, 100], [192, 66]])} fill="none" stroke="#1d4e6b" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
        <polyline points={pts([[78, 88], [78, 178], [168, 178]])} fill="none" stroke="#3b3a2c" strokeWidth="7" strokeLinejoin="round" />
        <polyline points={pts([[88, 78], [178, 78], [178, 168]])} fill="none" stroke="#3b3a2c" strokeWidth="7" strokeLinejoin="round" />
        <polyline points={pts([[86, 86], [170, 170]])} fill="none" stroke="#3b3a2c" strokeWidth="7" />
        {/* базы */}
        <rect x={X(64)} y={Y(96)} width={X(96) - X(64)} height={Y(64) - Y(96)} rx="10" fill="#14532d" opacity="0.9" />
        <rect x={X(160)} y={Y(192)} width={X(192) - X(160)} height={Y(160) - Y(192)} rx="10" fill="#7f1d1d" opacity="0.9" />
        <text x={X(66)} y={Y(66)} fontSize="10" fill="#bbf7d0">Свет</text>
        <text x={X(190)} y={Y(188)} fontSize="10" fill="#fecaca" textAnchor="end" dominantBaseline="hanging">Тьма</text>
        {/* тепловая карта фарма */}
        {heat.map(([cx, cy, g]) => (
          <rect key={`${cx},${cy}`} x={cx * cell} y={(CELLS - 1 - cy) * cell} width={cell} height={cell} fill="#f59e0b" opacity={0.15 + 0.7 * (g / maxGold)}>
            <title>{`${g.toLocaleString('ru-RU')} золота с крипов`}</title>
          </rect>
        ))}
        {/* маршрут */}
        {route.slice(1).map(([t, x, y], i) => {
          const [, px, py] = route[i]
          // Скачок дальше, чем можно пройти за 15 с (телепорт, смерть и возрождение), — пунктиром
          const jump = Math.hypot(x - px, y - py) > 30
          return <line key={t} x1={X(px)} y1={Y(py)} x2={X(x)} y2={Y(y)} stroke={timeColor(t / end)} strokeWidth={jump ? 1 : 1.8} strokeDasharray={jump ? '3 4' : undefined} strokeLinecap="round" opacity={jump ? 0.35 : 0.9} />
        })}
        {route.length > 0 && (
          <>
            <circle cx={X(route[0][1])} cy={Y(route[0][2])} r="4" fill="#fff" stroke="#0f172a" />
            <circle cx={X(route.at(-1)![1])} cy={Y(route.at(-1)![2])} r="4" fill="#ef4444" stroke="#0f172a" />
          </>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-amber-500 align-middle" />где добивал крипов (ярче — больше золота, за всю игру)</span>
        <span><span className="mr-1 inline-block h-0.5 w-5 align-middle" style={{ background: 'linear-gradient(90deg,#38bdf8,#facc15,#ef4444)' }} />маршрут: от начала к концу</span>
        <span>пунктир — телепорт или возрождение</span>
        <span>○ начало · <span className="text-red-400">●</span> конец отрезка</span>
      </div>
    </div>
  )
}
