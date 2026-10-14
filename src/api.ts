import { FUNCTION_URL, SUPABASE_ANON_KEY } from './config'
import type { Analysis, Parsing, RecentMatch } from './types'

async function call<T>(body: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.')
  }
  const data = await r.json().catch(() => null)
  if (!r.ok || data?.status === 'error') throw new Error(data?.message ?? `Ошибка сервера (${r.status})`)
  return data as T
}

export const analyzeMatch = (match: string, refresh = false) => call<Analysis | Parsing>({ match, refresh })

export const recentMatches = (player: string) =>
  call<{ status: 'matches'; account_id: number; matches: RecentMatch[] }>({ player })

export const sendFeedback = (match_id: number, slot: number | null, comment: string) =>
  call<{ status: 'ok' }>({ feedback: { match_id, slot, comment } })
