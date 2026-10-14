import { useState } from 'react'
import type { Player, RoleReport } from '../types'
import { itemImg } from './ui'

const TITLE: Record<RoleReport['kind'], string> = {
  carry: 'Разбор керри', mid: 'Разбор мидера', support: 'Разбор саппорта', offlane: 'Разбор оффлейнера',
}
const times = (n: number) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'раза' : 'раз'}`
const ofN = (a: number, b: number) => `${a} из ${b}`
const mins = (m: number[]) => m.map((x) => `${x}-я`).join(', ')

// Разбор по позиции: то, что важно именно для этой роли (в балл вины не входит).
export function RoleBlock({ p }: { p: Player }) {
  const [open, setOpen] = useState(false)
  const r = p.role_report
  if (!r) return null
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 py-0.5 text-left">
        <span className="text-slate-400">{TITLE[r.kind]}</span>
        <span className="min-w-0 flex-1 truncate text-right text-slate-300"><Summary r={r} /></span>
        <span className="text-slate-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-2 rounded bg-slate-800/70 px-2 py-1.5 text-[11px] leading-snug text-slate-300">
          {r.kind === 'carry' && <Carry r={r} />}
          {r.kind === 'mid' && <Mid r={r} />}
          {r.kind === 'support' && <Support r={r} />}
          {r.kind === 'offlane' && <Offlane r={r} />}
        </div>
      )}
    </div>
  )
}

function Summary({ r }: { r: RoleReport }) {
  if (r.kind === 'carry') return <>башни: пришёл {ofN(r.towers.came, r.towers.total)}</>
  if (r.kind === 'mid') return <>ганков {r.gank_kills + r.gank_assists}{r.ult ? `, ульта ${r.ult.casts}` : ''}</>
  if (r.kind === 'support') return <>руны {ofN(r.runes.been, r.runes.total)}, стаков {r.stacks ?? 0}</>
  return <>начал драк: {r.initiations.count}</>
}

const Good = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <span className={ok ? 'text-emerald-300' : 'text-red-300'}>{children}</span>

function Carry({ r }: { r: Extract<RoleReport, { kind: 'carry' }> }) {
  const t = r.towers, ro = r.roshan
  const missed = ro.windows.filter((w) => !w.taken)
  return (
    <>
      <div>
        <b>Ранняя игра (до 20 мин): драки у своих башен и потеря башен.</b>{' '}
        {t.total ? <>Пришёл на <Good ok={t.came * 2 >= t.total}>{ofN(t.came, t.total)}</Good>{t.tp ? `, из них ${t.tp} через ТП` : ''}.</> : 'Таких моментов не было.'}
        {t.list.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {t.list.map((e, i) => (
              <li key={i}>{e.minute}-я мин — {e.what}: {e.came ? <span className="text-emerald-300">пришёл{e.tp ? ' (ТП)' : ''}</span> : <span className="text-red-300">не было</span>}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <b>Рошан.</b> Наша команда: {ro.ours.length ? `${mins(ro.ours)} мин` : 'ни разу'}; соперник: {ro.theirs.length ? `${mins(ro.theirs)} мин` : 'ни разу'}.
        {ro.damage_share != null && <> Урон керри по Рошану — {ro.damage_share}% от команды.</>}
        {ro.windows.length > 0 && (
          <div>
            Окна для Рошана (выиграли драку, Рошан жив, по золоту не сильно позади): {ro.windows.map((w) => `${w.minute}-я мин${w.taken ? ' — взяли' : ' — не пошли'}`).join('; ')}.
            {missed.length > 0 && <Good ok={false}> Упущено: {missed.length}.</Good>}
          </div>
        )}
      </div>
    </>
  )
}

function Mid({ r }: { r: Extract<RoleReport, { kind: 'mid' }> }) {
  const u = r.ult
  return (
    <>
      <div>
        <b>Ганки и перемещения (6–20 мин).</b> Уходил с мида {times(r.rotations)}; убийств вне мида — {r.gank_kills}, помощи — {r.gank_assists}.
        Всего убийств {r.kills}{r.tp_kills ? `, ${r.tp_kills} — сразу после ТП` : ''}{r.smoke_kills ? `, ${r.smoke_kills} — под смоком` : ''}.
      </div>
      {u && (
        <div>
          <b>Ультимейт {u.name}.</b>{' '}
          {u.casts === 0 ? <Good ok={false}>Ни разу не использовал.</Good> : (
            <>
              Использовал {times(u.casts)}{u.damage ? <>; попал по героям — <Good ok={u.hit * 2 >= u.casts}>{ofN(u.hit, u.casts)}</Good>{u.avg_targets ? ` (героев за раз в среднем: ${String(u.avg_targets).replace('.', ',')})` : ''}</> : ''};
              после него команда убила кого-то за 8 секунд — <Good ok={u.kills_after * 2 >= u.casts}>{ofN(u.kills_after, u.casts)}</Good>.
            </>
          )}
        </div>
      )}
      <div><b>Руны (вода и руны силы до 20 мин):</b> забрал {ofN(r.runes.taken, r.runes.total)}.</div>
    </>
  )
}

function Items({ list, starts }: { list: Extract<RoleReport, { kind: 'support' }>['save_items']; starts?: boolean }) {
  return (
    <ul className="mt-1 space-y-1">
      {list.map((it) => (
        <li key={it.key} className="flex gap-2">
          <img src={itemImg(it.key)} alt={it.name} title={it.name} className="h-5 w-7 shrink-0 rounded-sm bg-slate-900 object-cover text-[0px]" />
          <span>
            <b>{it.name}</b> ({it.minute}-я мин): применил {times(it.uses)}, в драках — {it.in_fights}
            {it.on_allies != null && <>, на союзников — {it.on_allies}{it.saves != null && it.on_allies > 0 ? <> (<span className="text-emerald-300">спас {it.saves}</span>)</> : ''}</>}
            {starts && it.fight_starts != null && <>, в начале драки — {it.fight_starts}</>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Support({ r }: { r: Extract<RoleReport, { kind: 'support' }> }) {
  return (
    <>
      <div>
        <b>Руны для мидера (до 14 мин):</b> был у руны на <Good ok={r.runes.been * 3 >= r.runes.total}>{ofN(r.runes.been, r.runes.total)}</Good> появлений;
        руну забрала наша команда — {ofN(r.runes.ours, r.runes.total)}.
      </div>
      <div>
        <b>Стаки:</b> {r.stacks ?? '—'}. <b>Варды:</b> обсерверов {r.wards.obs ?? '—'}, сентри {r.wards.sen ?? '—'}, снял вражеских {r.wards.dewards ?? '—'}.
      </div>
      <div>
        <b>Сейв-предметы.</b> {r.save_items.length ? '' : <Good ok={false}>Не покупал (Glimmer, Force, Lotus, Eul, Мекансм, Pipe и т. п.).</Good>}
        {r.save_items.length > 0 && <Items list={r.save_items} />}
        <div className="text-slate-500">«Спас» — союзник не умер в следующие 6 секунд после применения.</div>
      </div>
    </>
  )
}

function Offlane({ r }: { r: Extract<RoleReport, { kind: 'offlane' }> }) {
  const a = r.after_objectives
  return (
    <>
      <div>
        <b>Инициация:</b> первым начал {r.initiations.count} из {r.initiations.fights} драк команды{r.initiations.count ? `, выиграно ${r.initiations.won}` : ''}.
        <div className="text-slate-500">Начал драку — первым из обеих команд нанёс урон герою.</div>
      </div>
      <div>
        <b>Предмет на инициацию.</b> {r.init_items.length ? <Items list={r.init_items} starts /> : <Good ok={false}>Не было (Blink, Force Staff, Shadow Blade и т. п.).</Good>}
      </div>
      <div>
        <b>Драки после объектов и Рошана</b> (башни, Рошан с 10-й мин): был в <Good ok={a.present * 3 >= a.fights * 2}>{ofN(a.present, a.fights)}</Good>.
      </div>
    </>
  )
}
