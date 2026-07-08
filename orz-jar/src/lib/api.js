import { supabase } from './supabase'

// pull everything the jar page needs in parallel. members are constants, so we only
// hit the db for approved tokens / counts / pending / my votes -> lean on free tier.
export async function fetchAll(myId) {
  const [approved, counts, pending, myVotes] = await Promise.all([
    supabase
      .from('tokens')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),
    supabase.from('member_counts').select('id, approved_count'),
    supabase
      .from('pending_tokens')
      .select('*')
      .order('created_at', { ascending: false }),
    myId
      ? supabase.from('votes').select('token_id, vote').eq('voter', myId)
      : Promise.resolve({ data: [] }),
  ])

  const counts_ = Object.fromEntries(
    (counts.data || []).map((r) => [r.id, Number(r.approved_count)]),
  )
  const voteBy = Object.fromEntries((myVotes.data || []).map((v) => [v.token_id, v.vote]))
  const pendingWithMine = (pending.data || []).map((p) => ({
    ...p,
    approves: Number(p.approves) || 0,
    rejects: Number(p.rejects) || 0,
    myVote: voteBy[p.id] ?? null,
  }))

  return {
    approvedTokens: approved.data || [],
    counts: counts_,
    pending: pendingWithMine,
    loaded: true,
  }
}

// file a new orz. it lands in "pending"; a db trigger auto-adds the submitter's
// approve vote, so only one more approval tips it into the jar.
export async function insertToken({ culprit, submittedBy, note, where, occurredAt }) {
  return supabase.from('tokens').insert({
    culprit,
    submitted_by: submittedBy,
    note: note || null,
    where_said: where || null,
    occurred_at: occurredAt || null,
  })
}

// cast or change a vote (one per person per token; upsert flips it).
export async function castVote({ tokenId, voter, vote }) {
  return supabase
    .from('votes')
    .upsert({ token_id: tokenId, voter, vote }, { onConflict: 'token_id,voter' })
}
