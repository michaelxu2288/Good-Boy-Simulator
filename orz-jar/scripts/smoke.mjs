// backend smoke test — verifies the schema, triggers, the verify_pin rpc, and the
// LOCKED-DOWN RLS all behave with the BROWSER publishable key (the same access the
// app has). it is bloat-safe: every write it makes is either rejected by RLS or
// pulled back via retract_token, so it never leaves a durable row behind.
// run from the project root:  node scripts/smoke.mjs
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env')
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
)

let failures = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
}

// 1. member_counts returns the 4 seeded members
{
  const { data, error } = await supabase.from('member_counts').select('*')
  check(!error && data?.length === 4, `member_counts returns 4 members ${error ? '(' + error.message + ')' : ''}`)
}

// 2. verify_pin rpc
{
  const { data: ok } = await supabase.rpc('verify_pin', { p_id: 'michael', p_pin: '0000' })
  const { data: bad } = await supabase.rpc('verify_pin', { p_id: 'michael', p_pin: '9999' })
  check(ok === true, 'verify_pin accepts the correct pin')
  check(bad === false, 'verify_pin rejects a wrong pin')
}

// 3. base members table (with pins) is NOT readable by anon
{
  const { data, error } = await supabase.from('members').select('*')
  check(!!error || !data?.length, 'base members table is hidden from anon (pins safe)')
}

// 4. RLS: anon canNOT self-approve straight into the jar (insert must be pending)
{
  const { data, error } = await supabase
    .from('tokens')
    .insert({ culprit: 'james', submitted_by: 'michael', status: 'approved', note: 'SMOKE — must be blocked' })
    .select()
  check(!!error || !data?.length, `insert with status=approved is rejected ${error ? '' : '(LEAKED A ROW!)'}`)
  if (data?.length) await supabase.rpc('retract_token', { p_id: data[0].id }) // best-effort cleanup
}

// 5. insert a clean token -> seed trigger auto-adds the submitter's approve -> pending, approves=1
let tokenId
{
  const { data, error } = await supabase
    .from('tokens')
    .insert({ culprit: 'james', submitted_by: 'michael', note: 'SMOKE TEST — auto-retracted' })
    .select()
    .single()
  tokenId = data?.id
  check(!error && !!tokenId, `insert pending token ${error ? '(' + error.message + ')' : ''}`)
  const { data: pend } = await supabase.from('pending_tokens').select('*').eq('id', tokenId).single()
  check(Number(pend?.approves) === 1, `submitter auto-approve -> approves=1 (got ${pend?.approves})`)
}

// 6. RLS: anon canNOT force a status flip via direct update (resolution is trigger-only)
{
  await supabase.from('tokens').update({ status: 'approved' }).eq('id', tokenId)
  const { data: still } = await supabase.from('pending_tokens').select('id').eq('id', tokenId).maybeSingle()
  check(!!still, 'anon cannot force-approve a token via direct update (still pending)')
}

// 7. RLS: anon canNOT delete a token via the table endpoint (only the scoped rpc may)
{
  await supabase.from('tokens').delete().eq('id', tokenId)
  const { data: still } = await supabase.from('pending_tokens').select('id').eq('id', tokenId).maybeSingle()
  check(!!still, 'anon cannot delete a token via the table endpoint')
}

// 8. retract_token pulls back the fresh pending ticket — and is our zero-bloat cleanup
{
  const { data: gone } = await supabase.rpc('retract_token', { p_id: tokenId })
  check(gone === true, 'retract_token removes a fresh pending ticket')
  const { data: left } = await supabase.from('pending_tokens').select('id').eq('id', tokenId).maybeSingle()
  check(!left, 'ticket is gone after retract (no residual bloat)')
}

console.log(`\n${failures === 0 ? 'ALL GOOD ✓' : failures + ' FAILURE(S) ✗'}`)
process.exit(failures === 0 ? 0 : 1)
