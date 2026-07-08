import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MEMBER_BY_ID } from '../constants'

// ---- token geometry (kept in js so packing + css agree) --------------------
const D = 42 // token diameter, px
const GX = 7 // min horizontal gap => tokens never touch until the jar is full
const GY = 7 // min vertical gap

// deterministic per-id pseudo-random so a token keeps the same jitter/tilt/overflow
// spot across re-renders (it looks physically settled, not reshuffling every paint).
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// month/day on the token face, in pacific time (e.g. "7/8")
function md(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
  })
}
// full absolute pacific timestamp for the detail popup
function fullPst(iso) {
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

// bottom-up packing: fill rows from the floor, centered, with a little jitter. every
// slot is >= D+gap from its neighbours so tokens DON'T overlap -- until the jar is
// full (capacity = rows*perRow), after which extras pile on top and may overlap.
function packSlots(ordered, w, h) {
  const step = D + GX
  const rowH = D + GY
  const perRow = Math.max(1, Math.floor((w + GX) / step))
  const rows = Math.max(1, Math.floor((h + GY) / rowH))
  const capacity = perRow * rows
  const n = ordered.length

  return ordered.map((tok, i) => {
    const r = hash(tok.id)
    const jx = (r % 7) - 3 // -3..3 px
    const jy = ((r >> 3) % 7) - 3 // -3..3 px
    const rot = ((r >> 6) % 13) - 6 // -6..6 deg

    if (i < capacity) {
      const row = Math.floor(i / perRow)
      const col = i % perRow
      const rowCount = Math.min(perRow, n - row * perRow)
      const rowW = rowCount * D + (rowCount - 1) * GX
      const startX = Math.max(0, (w - rowW) / 2)
      const x = Math.max(0, Math.min(w - D, startX + col * step + jx))
      const bottom = Math.max(0, row * rowH + jy)
      return { tok, x, bottom, rot, overlap: false }
    }
    // overflow: jar is full -> scatter across the whole interior so extras overlap
    // the pile (a crammed jar) instead of stacking off the clipped top edge.
    const x = Math.max(0, Math.min(w - D, hash(tok.id + 'x') % Math.max(1, w - D)))
    const bottom = Math.max(0, Math.min(h - D, hash(tok.id + 'y') % Math.max(1, h - D)))
    return { tok, x, bottom, rot, overlap: true }
  })
}

// small popup with a token's full metadata. plain onClick => taps work on mobile.
function TokenDetail({ token, onClose }) {
  const m = MEMBER_BY_ID[token.culprit]
  const by = MEMBER_BY_ID[token.submitted_by]
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="token-pop card-taped" onClick={(e) => e.stopPropagation()}>
        <div className="token-pop-head">
          <span className="token-dot" style={{ background: m?.color }} />
          <span className="token-pop-who" style={{ color: m?.color }}>
            {m?.name ?? token.culprit}
          </span>
          <button className="token-pop-x" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>
        {token.note && <p className="token-pop-note">“{token.note}”</p>}
        <dl className="token-pop-meta">
          <div>
            <dt>when</dt>
            <dd>{fullPst(token.created_at)}</dd>
          </div>
          {token.where_said && (
            <div>
              <dt>where</dt>
              <dd>{token.where_said}</dd>
            </div>
          )}
          <div>
            <dt>filed by</dt>
            <dd>{by?.name ?? token.submitted_by}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export default function Jar({ tokens }) {
  const total = tokens.length
  const stackRef = useRef(null)
  const [size, setSize] = useState({ w: 316, h: 420 }) // sane defaults before measure
  const [selected, setSelected] = useState(null)

  // measure the jar interior and re-pack on resize so packing matches real pixels.
  useLayoutEffect(() => {
    const el = stackRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // oldest at the bottom, newest drops on top -> reads as gravity.
  const slots = useMemo(() => {
    const ordered = [...tokens].reverse()
    return packSlots(ordered, size.w, size.h)
  }, [tokens, size.w, size.h])

  return (
    <div className="jar">
      <div className="jar-tape">orz</div>
      <div className="jar-glass">
        {total === 0 && (
          <p className="jar-empty">
            empty jar.
            <br />
            go catch an orz.
          </p>
        )}
        <div className="jar-stack" ref={stackRef}>
          <AnimatePresence initial={false}>
            {slots.map(({ tok, x, bottom, rot, overlap }) => {
              const m = MEMBER_BY_ID[tok.culprit]
              const hint = `${m?.name ?? tok.culprit} · ${md(tok.created_at)}${
                tok.where_said ? ` · @${tok.where_said}` : ''
              }${tok.note ? ` · "${tok.note}"` : ''}`
              return (
                <motion.button
                  key={tok.id}
                  type="button"
                  layout
                  className="jar-token-c"
                  style={{
                    left: x,
                    bottom,
                    background: m?.color,
                    zIndex: overlap ? 6 : 1,
                  }}
                  initial={{ y: -(size.h + 70), opacity: 0, rotate: -22 }}
                  animate={{ y: 0, opacity: 1, rotate: rot }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.85 }}
                  onClick={() => setSelected(tok)}
                  title={hint}
                >
                  <span className="jar-token-date">{md(tok.created_at)}</span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
      <p className="jar-caption">
        {total} token{total === 1 ? '' : 's'} in the jar
      </p>

      {selected && <TokenDetail token={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
