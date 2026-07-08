import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useRealtime } from '../hooks/useRealtime'
import TopBar from '../components/TopBar'
import Jar from '../components/Jar'
import CounterBoard from '../components/CounterBoard'
import PendingQueue from '../components/PendingQueue'
import NewTokenModal from '../components/NewTokenModal'

export default function JarPage() {
  useRealtime() // subscribes on mount, cleans up on unmount

  const identity = useStore((s) => s.identity)
  const approvedTokens = useStore((s) => s.approvedTokens)
  const counts = useStore((s) => s.counts)
  const pending = useStore((s) => s.pending)
  const loaded = useStore((s) => s.loaded)
  const guest = !!identity?.guest

  const [modal, setModal] = useState(false)

  return (
    <div className="page">
      <TopBar />
      <main className="columns">
        <section className="col-left">
          {guest ? (
            <p className="guest-note">you're browsing as a guest — read only.</p>
          ) : (
            <button className="btn-green big drop-btn" onClick={() => setModal(true)}>
              ✎ submit a ticket
            </button>
          )}
          <PendingQueue pending={pending} />
        </section>

        <section className="col-right">
          <CounterBoard counts={counts} />
          <Jar tokens={approvedTokens} />
        </section>
      </main>

      {modal && <NewTokenModal onClose={() => setModal(false)} />}
      {!loaded && <div className="loading">loading the jar…</div>}
    </div>
  )
}
