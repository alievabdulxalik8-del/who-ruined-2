import { CDN } from '../config'
import type { Item } from '../types'

export const heroImg = (key: string | null) => (key ? `${CDN}/heroes/${key}.png` : '')
export const itemImg = (key: string) => `${CDN}/items/${key.replace(/^recipe_.*/, 'recipe')}.png`

export function HeroIcon({ heroKey, name, className = 'h-9 w-16' }: { heroKey: string | null; name: string; className?: string }) {
  return heroKey
    ? <img src={heroImg(heroKey)} alt={name} title={name} loading="lazy" className={`${className} shrink-0 overflow-hidden rounded bg-slate-800 object-cover text-[0px]`} />
    : <div className={`${className} shrink-0 rounded bg-slate-800`} />
}

export function Items({ items }: { items: Item[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <img
          key={i}
          src={itemImg(it.key)}
          alt={it.name}
          title={it.name}
          loading="lazy"
          className={`h-6 w-8 overflow-hidden rounded-sm bg-slate-800 object-cover text-[0px] ${it.neutral ? 'rounded-full ring-1 ring-slate-600' : ''}`}
        />
      ))}
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

// Цвет балла вины: 0 — хорошо (зелёный), 100 — плохо (красный)
export const scoreColor = (s: number) => (s >= 65 ? 'bg-red-500' : s >= 50 ? 'bg-orange-500' : s >= 35 ? 'bg-yellow-500' : 'bg-emerald-500')
export const scoreText = (s: number) => (s >= 65 ? 'text-red-400' : s >= 50 ? 'text-orange-400' : s >= 35 ? 'text-yellow-300' : 'text-emerald-400')

export function Bar({ value, className = 'h-1.5' }: { value: number; className?: string }) {
  return (
    <div className={`${className} w-full overflow-hidden rounded-full bg-slate-800`}>
      <div className={`h-full rounded-full ${scoreColor(value)}`} style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
    </div>
  )
}
