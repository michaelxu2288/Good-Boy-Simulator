import { MEMBER_BY_ID } from '../constants'
import { castVote } from '../lib/api'
import { useStore } from '../store/useStore'
import OrzMark from './OrzMark'

function timePst(iso) {
  // absolute pacific time, e.g. "7/8, 3:45 PM PDT"
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
}

function VoteControls({ token }) {
  const identity = useStore((s) => s.identity)
  const guest = !!identity?.guest
  const mine = token.myVote

  const onVote = (vote) => {
    if (guest) return
    // fire-and-forget; the realtime refetch reconciles tallies + resolution.
    castVote({ tokenId: token.id, voter: identity.id, vote })
  }

  return (
    <div className="vote-controls">
      <button
        className={`vote-btn nah ${mine === 'reject' ? 'on' : ''}`}
        disabled={guest}
        onClick={() => onVote('reject')}
      >
        nah <b>{token.rejects}</b>/2
      </button>
      <button
        className={`vote-btn yeah ${mine === 'approve' ? 'on' : ''}`}
        disabled={guest}
        onClick={() => onVote('approve')}
      >
        yeah <b>{token.approves}</b>/2
      </button>
    </div>
  )
}

function PendingCard({ token }) {
  const m = MEMBER_BY_ID[token.culprit]
  return (
    <li className="pending-card card-taped">
      <div className="pending-head">
        <OrzMark color={m?.color} size={20} />
        <span className="pending-who" style={{ color: m?.color }}>
          {m?.name ?? token.culprit}
        </span>
        <span className="pending-time">{timePst(token.created_at)}</span>
      </div>
      {token.note && <p className="pending-note">“{token.note}”</p>}
      <div className="pending-foot">
        {token.where_said && <span className="pending-where">@ {token.where_said}</span>}
        <VoteControls token={token} />
      </div>
    </li>
  )
}

export default function PendingQueue({ pending }) {
  return (
    <section className="queue">
      <h2 className="queue-title">
        open tickets for review:{pending.length ? ` ${pending.length}` : ''}
      </h2>
      {pending.length === 0 ? (
        <p className="queue-empty">nothing pending. honest day.</p>
      ) : (
        <ul className="queue-list">
          {pending.map((t) => (
            <PendingCard key={t.id} token={t} />
          ))}
        </ul>
      )}
    </section>
  )
}
