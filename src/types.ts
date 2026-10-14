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
  farm?: Farm | null
  heat?: [number, number, number][] | null // [клетка x, клетка y, золото] — сетка 16×16
  route?: [number, number, number][] | null // [секунда, x, y], координаты Stratz 64..192
}

export type Farm = {
  item: {
    key: string; name: string; minute: number
    gpm_before: number | null; gpm_after: number | null
    lhpm_before: number | null; lhpm_after: number | null
    nw_at: number | null; avg_nw_at: number | null
  } | null
  gold_total: number | null
  dead_min: number | null
  lost_to_deaths: number | null
  potential: number | null
  nw_curve: number[] | null
  avg_curve: number[] | null
  checkpoints: { minute: number; nw: number; avg: number }[]
  end: { minute: number; nw: number; avg: number; pct: number } | null
}

export type ChatTag = 'feed' | 'toxic' | 'give_up' | 'blame' | 'positive'
export type Chat = {
  messages: { t: number; slot: number; text: string; wheel: boolean; tags: ChatTag[] }[]
  players: {
    slot: number; messages: number; toxic: number; feed: number; give_up: number; blame: number; positive: number
    first_toxic_minute: number | null
    feed_check: { minute: number; text: string; deaths_5min: number; usual_5min: number; confirmed: boolean } | null
  }[]
  losers: { mood: string; toxic: number; blame: number; give_up: number; positive: number; feed: number }
  winners: { mood: string; toxic: number; blame: number; give_up: number; positive: number; feed: number }
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
  chat?: Chat | null
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
