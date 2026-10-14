// Ответ Edge Function dota-analyze (см. supabase/functions/dota-analyze).

export type Side = 'radiant' | 'dire'
export type PartKey = 'hero' | 'lane' | 'deaths' | 'fights' | 'role'

export type Item = { id: number; key: string; name: string; neutral: boolean }

export type DeathDetail = { minute: number; weight: number; gold_lost: number | null; tags: string[] }

export type ScoreParts = {
  hero?: { score: number; metrics: { key: string; raw: number; pct: number; counted?: number }[]; farm_ignored?: boolean } | null
  lane?: {
    score: number
    lane: 'top' | 'mid' | 'bot' | null
    outcome: 'stomp_lost' | 'lost' | 'tie' | 'won' | 'stomp_won' | null
    gold_diff_10: number | null
    opponent_slot: number | null
  } | null
  deaths?: { score: number; deaths: number; deaths_pct?: number; avg_weight?: number; details: DeathDetail[] } | null
  fights?: {
    score: number
    participation: number
    damage_share: number
    gold_share: number
    lost_fights?: number
    absent_lost?: number
    absent_outnumbered?: number
    absent_minutes?: number[]
  } | null
  role?: ({ score: number } & Record<string, number>) | null
}

export type Player = {
  slot: number
  side: Side
  lost: boolean
  name: string
  hero: string
  hero_key: string | null
  items?: Item[]
  net_worth?: number | null
  position: number | null
  position_source: 'stratz' | 'opendota' | null
  position_uncertain: boolean
  position_notes: string[]
  imp: number | null
  leaver: { code: number; text: string; minute: number | null } | null
  intentional_feeding?: boolean | null
  kda: string
  gpm: number
  xpm: number
  wards: number | null
  score?: number | null
  score_parts?: ScoreParts | null
}

export type Verdict =
  | { kind: 'leaver' | 'feeder'; slot: number; text: string; others: number[] }
  | {
      kind: 'main' | 'two' | 'team'
      slots: number[]
      text: string
      gap: number
      confidence: number
      confidence_parts: { reason: string; points: number }[]
      warnings: string[]
    }

export type TimelineEvent =
  | { t: number; type: 'fight'; winner: Side | null; deaths: Record<Side, number> }
  | { t: number; type: 'roshan'; team: Side }
  | { t: number; type: 'building'; lost: Side; name: string }

export type Analysis = {
  status: 'ready' | 'rejected'
  stage?: 'leaver' | 'verdict' | 'data'
  reason?: string
  message?: string
  verdict?: Verdict | null
  match_id: number
  links: { opendota: string; stratz: string; dotabuff: string }
  match?: {
    duration_min: number
    start_time: number
    game_mode_name: string
    turbo: boolean
    radiant_win: boolean
    losing_side: Side
    losing_side_ru: string
    score: Record<Side, number>
    parsed: boolean
  }
  sources?: { stratz: { ok: boolean; error?: string }; wait_timed_out?: boolean }
  flags?: string[]
  lanes?: { lane: 'top' | 'mid' | 'bot'; outcome_raw: string | null; for_losers: string | null }[]
  team_report?: {
    gold_diff: { min10: number | null; min20: number | null }
    lanes: { lost: number; tie: number; won: number }
    fights: { won: number; lost: number }
    towers_lost: number
    towers_taken: number
    roshans: { ours: number; theirs: number }
  }
  timeline?: { gold_adv: number[]; xp_adv: number[] | null; events: TimelineEvent[] } | null
  players?: Player[]
  cached?: boolean
}

export type Parsing = { status: 'parsing'; match_id: number; message: string; retry_after_sec: number; waiting_for?: string[] }

export type RecentMatch = {
  match_id: number
  start_time: number
  duration_sec: number
  hero: string
  hero_key: string | null
  won: boolean
  kda: string
  game_mode: string
}
