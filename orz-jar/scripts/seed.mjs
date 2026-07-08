// seed the jar with approved test tokens (respecting the locked-down RLS: insert lands
// pending w/ the submitter's auto-approve, then a 2nd distinct approval tips it into the
// jar). every row's note is tagged "[test] " so cleanup is one line:
//   delete from public.tokens where note like '[test]%';   (votes cascade)
// usage:  node scripts/seed.mjs 20     (count defaults to 20)
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env')
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const MEMBERS = ['michael', 'james', 'mzwu', 'liam']
const WHERE = ['orz house', 'gc', 'dm', 'outside', 'other', '', '']
const NOTES = [
  'lost the bo3 and whispered orz', 'missed the smash, full orz', 'got 4-0d in melee',
  'whiffed the grab on point', 'orz after the ranked loss', 'clutch failed, orz',
  'fed bot lane again', 'canceled plans then orz', 'orz at the group project',
  'died to the first boss', 'forgot the deadline, orz', 'missed the free throw',
  'orz mid interview', 'ran it down and orz', 'threw the lead, orz',
  'no-showed and orz', 'orz over the quiz grade', 'got cooked in chess',
  'overslept the meeting', 'orz, keyboard died mid-game',
]

const N = Number(process.argv[2] || 20)
const SPAN_DAYS = Math.max(14, Math.min(160, Math.round(N / 4))) // spread the dates
const CH = 100 // chunk size for bulk calls
const rand = (a) => a[Math.floor(Math.random() * a.length)]

// build pending rows with varied culprit / submitter / where / date
const now = Date.now()
const rows = Array.from({ length: N }, () => {
  const submitter = rand(MEMBERS)
  return {
    culprit: rand(MEMBERS),
    submitted_by: submitter,
    note: `[test] ${rand(NOTES)}`,
    where_said: rand(WHERE) || null,
    created_at: new Date(now - Math.random() * SPAN_DAYS * 86400000).toISOString(),
  }
})

// 1. insert (each fires the submitter auto-approve -> approves=1, still pending)
const inserted = []
for (let i = 0; i < rows.length; i += CH) {
  const { data, error } = await supabase
    .from('tokens')
    .insert(rows.slice(i, i + CH))
    .select('id, submitted_by')
  if (error) {
    console.error('insert error:', error.message)
    process.exit(1)
  }
  inserted.push(...data)
  console.log(`inserted ${inserted.length}/${N}`)
}

// 2. second approval by a DISTINCT member -> trigger flips each to approved (into the jar)
const votes = inserted.map((r) => ({
  token_id: r.id,
  voter: rand(MEMBERS.filter((m) => m !== r.submitted_by)),
  vote: 'approve',
}))
for (let i = 0; i < votes.length; i += CH) {
  const { error } = await supabase
    .from('votes')
    .upsert(votes.slice(i, i + CH), { onConflict: 'token_id,voter', ignoreDuplicates: true })
  if (error) {
    console.error('vote error:', error.message)
    process.exit(1)
  }
  console.log(`approved ${Math.min(i + CH, votes.length)}/${N}`)
}

// report the resulting jar
const { data: counts } = await supabase.from('member_counts').select('display_name, approved_count')
const total = (counts || []).reduce((s, c) => s + Number(c.approved_count), 0)
console.log(`\njar now holds ${total} approved tokens:`)
;(counts || []).forEach((c) => console.log(`  ${c.display_name}: ${c.approved_count}`))
