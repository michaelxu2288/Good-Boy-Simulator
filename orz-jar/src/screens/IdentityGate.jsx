import { useState } from 'react'
import { MEMBERS } from '../constants'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import OrzMark from '../components/OrzMark'

// "who are you" gate: pick a pen (member) + pin, or slip in as a guest.
export default function IdentityGate() {
  const setIdentity = useStore((s) => s.setIdentity)
  const [picked, setPicked] = useState(null) // a member object, or null
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmPin = async () => {
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.rpc('verify_pin', {
      p_id: picked.id,
      p_pin: pin,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data === true) {
      setIdentity({ id: picked.id, name: picked.name, color: picked.color })
    } else {
      setErr('wrong pin')
      setPin('')
    }
  }

  return (
    <div className="gate">
      <div className="gate-card card-taped">
        <h1 className="gate-title">orz jar</h1>

        {!picked ? (
          <>
            <p className="gate-q">whose hand is this?</p>
            <div className="pen-row">
              {MEMBERS.map((m) => (
                <button
                  key={m.id}
                  className="pen-chip"
                  style={{ '--c': m.color }}
                  onClick={() => {
                    setPicked(m)
                    setPin('')
                    setErr('')
                  }}
                >
                  <OrzMark color={m.color} size={30} />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
            <button className="guest-link" onClick={() => setIdentity({ guest: true })}>
              just looking (guest) →
            </button>
          </>
        ) : (
          <>
            <p className="gate-q">
              hi <b style={{ color: picked.color }}>{picked.name}</b> — pin?
            </p>
            <input
              className="pin-input"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              autoFocus
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && pin && confirmPin()}
              placeholder="••••"
            />
            {err && <p className="form-err">{err}</p>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setPicked(null)}>
                back
              </button>
              <button className="btn-green" disabled={busy || !pin} onClick={confirmPin}>
                {busy ? '…' : "that's me"}
              </button>
            </div>
          </>
        )}
      </div>
      <p className="gate-foot">orz house ngmis, 1 token = 3$</p>
    </div>
  )
}
