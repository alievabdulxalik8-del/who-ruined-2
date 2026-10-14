// Публичные адрес и anon-ключ Supabase: их и так видно в браузере, доступ к таблицам закрыт RLS,
// данные идут только через Edge Function dota-analyze. Ключ service_role сюда не кладём никогда.
export const SUPABASE_URL = 'https://hyjyfmgskcjijyyblvtg.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anlmbWdza2NqaWp5eWJsdnRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NTcxODAsImV4cCI6MjEwNDEzMzE4MH0.SCEvfeu-qJ2U9il_smxVGX51argOHiEjtLE9Th-sF6Y'
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/dota-analyze`

export const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react'
