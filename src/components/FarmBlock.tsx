import { useState } from 'react'
import type { Player } from '../types'
import { itemImg } from './ui'

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')
const num = (n: number) => String(n).replace('.', ',')
const change = (a: number | null, b: number | null) =>
  a && b != null ? `${b >= a ? '+' : '−'}${Math.abs(Math.round(((b - a) / a) * 100))}%` : ''

// Фарм игрока: фарм-предмет (до и после), потенциальный и фактический фарм, ценность против среднего игрока.
export function FarmBlock({ p }: { p: Player }) {
  const [open, setOpen] = useState(false)
  const f = p.farm
  if (!f) return null
  const it = f.item
  const actualPct = f.potential && f.gold_total ? Math.round((f.gold_total / f.potential) * 100) : null
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 py-0.5 text-left">
        <span className="text-slate-400">Фарм</span>
        <span className="flex-1 truncate text-right text-slate-300">
          {f.end ? <>ценность <b className={f.end.pct >= 100 ? 'text-emerald-300' : 'text-red-300'}>{f.end.pct}%</b> от средней</> : actualPct != null ? <>{actualPct}% от потенциала</> : ''}
        </span>
        <span className="text-slate-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-2 rounded bg-slate-800/70 px-2 py-1.5 text-[11px] leading-snug text-slate-300">
          {it ? (
            <div className="flex gap-2">
              <img src={itemImg(it.key)} alt={it.name} title={it.name} className="h-6 w-8 shrink-0 rounded-sm bg-slate-900 object-cover text-[0px]" />
              <div>
                <div><b>{it.name}</b> на {it.minute}-й минуте</div>
                {it.gpm_before != null && it.gpm_after != null && (
                  <div>GPM за 5 мин до → после: {fmt(it.gpm_before)} → <b>{fmt(it.gpm_after)}</b> ({change(it.gpm_before, it.gpm_after)})</div>
                )}
                {it.lhpm_before != null && it.lhpm_after != null && (
                  <div>Добиваний в минуту: {num(it.lhpm_before)} → <b>{num(it.lhpm_after)}</b> ({change(it.lhpm_before, it.lhpm_after)})</div>
                )}
                {it.nw_at != null && it.avg_nw_at != null && (
                  <div className="text-slate-400">Ценность к этой минуте {fmt(it.nw_at)}, у среднего игрока на {p.hero} — {fmt(it.avg_nw_at)}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-slate-400">Фарм-предмета (Battle Fury, Midas, Radiance, Maelstrom и т. п.) не было.</div>
          )}

          {f.potential != null && f.gold_total != null && (
            <div>
              <div>Заработал <b>{fmt(f.gold_total)}</b> золота из потенциальных <b>{fmt(f.potential)}</b>{actualPct != null ? ` (${actualPct}%)` : ''}.</div>
              {f.dead_min != null && f.lost_to_deaths != null && (
                <div className="text-slate-400">Был мёртвым {num(f.dead_min)} мин — за это время недобрал ≈ {fmt(f.lost_to_deaths)} золота.</div>
              )}
            </div>
          )}

          {f.nw_curve && f.avg_curve && (
            <div>
              <div className="mb-1">Ценность по минутам: <span className="text-amber-300">игрок</span> и <span className="text-slate-400">средний игрок на {p.hero} на этой позиции</span></div>
              <NetWorthChart nw={f.nw_curve} avg={f.avg_curve} item={it?.minute ?? null} />
              {f.checkpoints.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3">
                  {f.checkpoints.map((c) => (
                    <span key={c.minute}>{c.minute} мин: <b className={c.nw >= c.avg ? 'text-emerald-300' : 'text-red-300'}>{Math.round((c.nw / c.avg) * 100)}%</b></span>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-slate-500">
            Потенциал = заработанное золото + сколько он заработал бы за время, пока был мёртв (по его же темпу).
            Средний игрок — данные Stratz по этому герою и позиции.
          </p>
        </div>
      )}
    </div>
  )
}

function NetWorthChart({ nw, avg, item }: { nw: number[]; avg: number[]; item: number | null }) {
  const n = Math.min(nw.length, avg.length)
  if (n < 3) return null
  const W = 300, H = 90, L = 2, R = 2, T = 4, B = 12
  const max = Math.max(...nw.slice(0, n), ...avg.slice(0, n), 1)
  const sx = (m: number) => L + (m / (n - 1)) * (W - L - R)
  const sy = (v: number) => T + (1 - v / max) * (H - T - B)
  const path = (a: number[]) => a.slice(0, n).map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Ценность игрока и среднего игрока по минутам">
      {[10, 20, 30, 40, 50].filter((m) => m < n).map((m) => (
        <g key={m}>
          <line x1={sx(m)} x2={sx(m)} y1={T} y2={H - B} stroke="#1e293b" />
          <text x={sx(m)} y={H - 2} textAnchor="middle" fontSize="8" fill="#64748b">{m}</text>
        </g>
      ))}
      {item != null && item < n && <line x1={sx(item)} x2={sx(item)} y1={T} y2={H - B} stroke="#38bdf8" strokeDasharray="3 2" />}
      <path d={path(avg)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={path(nw)} fill="none" stroke="#fbbf24" strokeWidth="2" />
    </svg>
  )
}
