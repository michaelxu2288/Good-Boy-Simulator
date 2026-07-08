import { useState } from 'react'
import { MEMBERS, WHERE_OPTIONS } from '../constants'
import { insertToken } from '../lib/api'
import { useStore } from '../store/useStore'
import OrzMark from './OrzMark'

export default function NewTokenModal({ onClose }) {
  const identity = useStore((s) => s.identity)
  const [culprit, setCulprit] = useState('')
  const [note, setNote] = useState('')
  const [where, setWhere] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!culprit) {
      setErr('pick who said it')
      return
    }
    setBusy(true)
    setErr('')
    const { error } = await insertToken({
      culprit,
      submittedBy: identity.id,
      note,
      where,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onClose()
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <form className="modal card-taped" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="modal-title">submit token for review</h2>

        <label className="field-label">who said it?</label>
        <div className="culprit-row">
          {MEMBERS.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`culprit-chip ${culprit === m.id ? 'on' : ''}`}
              style={{ '--c': m.color }}
              onClick={() => setCulprit(m.id)}
            >
              <OrzMark color={m.color} size={20} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>

        <label className="field-label">
          what happened? <span className="opt">(optional)</span>
        </label>
        <textarea
          className="field-note"
          value={note}
          maxLength={280}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder="lost the bo3 and whispered orz"
        />

        <div className="field-bottom">
          <label className="field-mini">
            where <span className="opt">(optional)</span>
            <select value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">—</option>
              {WHERE_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>

        {err && <p className="form-err">{err}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            never mind
          </button>
          <button type="submit" className="btn-green" disabled={busy}>
            {busy ? 'submitting…' : 'submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
