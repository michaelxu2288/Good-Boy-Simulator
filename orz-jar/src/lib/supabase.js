import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // fail loud in dev so a missing .env is obvious before we hit supabase
  console.warn('[orz-jar] missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env')
}

// we use our own lightweight identity gate (pick person + pin), not supabase auth,
// so disable session persistence to keep the client lean. throttle realtime events
// to stay friendly to the free tier.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
})
