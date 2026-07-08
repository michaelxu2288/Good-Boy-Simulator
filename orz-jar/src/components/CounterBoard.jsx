import { MEMBERS } from '../constants'

// render a count as hand-scrawled tally marks: groups of 5 = 4 uprights + 1 slash.
function Tally({ count, color }) {
  const groups = []
  let left = count
  while (left > 0) {
    groups.push(Math.min(5, left))
    left -= 5
  }
  return (
    <span className="tally" style={{ color }}>
      {groups.length === 0 && <span className="tally-none">·</span>}
      {groups.map((n, gi) => (
        <span className="tally-group" key={gi}>
          {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
            <i className="tally-bar" key={i} />
          ))}
          {n === 5 && <i className="tally-slash" />}
        </span>
      ))}
    </span>
  )
}

// the leaderboard, kept as tally marks (the honest device for a counting app).
export default function CounterBoard({ counts }) {
  const rows = MEMBERS.map((m) => ({ ...m, count: counts[m.id] || 0 })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  )
  return (
    <div className="scoreboard">
      <h2 className="scoreboard-title">scoreboard</h2>
      <ul className="scoreboard-list">
        {rows.map((m) => (
          <li className="score-row" key={m.id}>
            <span className="score-name" style={{ color: m.color }}>
              {m.name}
            </span>
            <Tally count={m.count} color={m.color} />
            <span className="score-num">{m.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
