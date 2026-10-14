// Картинка с вердиктом для отправки в WhatsApp/Telegram: рисуем на canvas без сторонних библиотек.
// Картинки героев с CDN Steam не рисуем — без CORS они «портят» canvas и его нельзя сохранить.
import type { Analysis, Player } from './types'
import { POSITION_NAMES, reasonsFor } from './explain'

const W = 1080
const PAD = 64
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word } else line = test
  }
  if (line) lines.push(line)
  return lines
}

const scoreColor = (s: number) => (s >= 65 ? '#ef4444' : s >= 50 ? '#f97316' : s >= 35 ? '#eab308' : '#10b981')

export async function makeShareImage(data: Analysis, culprits: Player[]): Promise<Blob> {
  const m = data.match!
  const losers = (data.players ?? []).filter((p) => p.lost).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  // Сначала считаем высоту на черновом холсте, потом рисуем
  const draw = (ctx: CanvasRenderingContext2D) => {
    let y = PAD
    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, ctx.canvas.height)
    ctx.textBaseline = 'top'
    ctx.font = `700 44px ${FONT}`; ctx.fillStyle = '#f1f5f9'; ctx.fillText('Who Ruined ', PAD, y)
    ctx.fillStyle = '#ef4444'; ctx.fillText('2.0', PAD + ctx.measureText('Who Ruined ').width, y)
    y += 64
    ctx.font = `400 28px ${FONT}`; ctx.fillStyle = '#94a3b8'
    ctx.fillText(`Матч ${data.match_id} · ${m.game_mode_name} · ${m.duration_min} мин · Свет ${m.score.radiant} : ${m.score.dire} Тьма`, PAD, y)
    y += 64

    const v = data.verdict
    const text = data.status === 'rejected' ? `Этот матч не оцениваем: ${data.message ?? ''}` : v?.text ?? 'Вердикт не посчитан'
    ctx.font = `700 52px ${FONT}`; ctx.fillStyle = v && v.kind !== 'team' ? '#fca5a5' : '#7dd3fc'
    for (const l of wrap(ctx, text, W - 2 * PAD)) { ctx.fillText(l, PAD, y); y += 66 }
    if (v && 'confidence' in v) {
      ctx.font = `400 28px ${FONT}`; ctx.fillStyle = '#94a3b8'; ctx.fillText(`Уверенность ${v.confidence}%`, PAD, y + 4); y += 52
    }
    y += 16

    for (const p of culprits.slice(0, 2)) {
      const reasons = reasonsFor(p, m.duration_min).slice(0, culprits.length > 1 ? 2 : 3)
      if (!reasons.length) continue
      ctx.font = `700 32px ${FONT}`; ctx.fillStyle = '#e2e8f0'; ctx.fillText(`${p.name} (${p.hero})`, PAD, y); y += 48
      ctx.font = `400 30px ${FONT}`; ctx.fillStyle = '#cbd5e1'
      reasons.forEach((r, i) => {
        wrap(ctx, `${i + 1}. ${r}`, W - 2 * PAD - 20).forEach((l, j) => { ctx.fillText(l, PAD + (j ? 34 : 0), y); y += 42 })
        y += 6
      })
      y += 16
    }

    ctx.font = `700 32px ${FONT}`; ctx.fillStyle = '#e2e8f0'; ctx.fillText(`Балл вины — ${m.losing_side_ru}`, PAD, y); y += 54
    for (const p of losers) {
      const s = p.score ?? 0
      ctx.font = `400 28px ${FONT}`; ctx.fillStyle = '#cbd5e1'
      const label = `${p.hero}${p.position ? ` · ${POSITION_NAMES[p.position]}` : ''}`
      ctx.fillText(label.length > 30 ? label.slice(0, 29) + '…' : label, PAD, y)
      const bx = PAD + 470, bw = W - PAD - bx - 80
      ctx.fillStyle = '#1e293b'; ctx.fillRect(bx, y + 8, bw, 18)
      ctx.fillStyle = scoreColor(s); ctx.fillRect(bx, y + 8, Math.max(6, (bw * Math.min(100, s)) / 100), 18)
      ctx.font = `700 30px ${FONT}`; ctx.fillStyle = scoreColor(s); ctx.textAlign = 'right'; ctx.fillText(String(p.score ?? '—'), W - PAD, y); ctx.textAlign = 'left'
      y += 50
    }
    y += 24
    ctx.font = `400 26px ${FONT}`; ctx.fillStyle = '#64748b'
    ctx.fillText('Разбор целиком: alievabdulxalik8-del.github.io/who-ruined-2', PAD, y)
    return y + 40 + PAD / 2
  }
  const probe = document.createElement('canvas'); probe.width = W; probe.height = 4000
  const h = draw(probe.getContext('2d')!)
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Math.ceil(h)
  draw(canvas.getContext('2d')!)
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Не удалось сделать картинку'))), 'image/png'))
}

// Поделиться (на телефоне откроется меню WhatsApp/Telegram) или скачать файл
export async function shareOrDownload(blob: Blob, matchId: number) {
  const file = new File([blob], `who-ruined-${matchId}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: `Кто слил матч ${matchId}? ${location.href}` }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
