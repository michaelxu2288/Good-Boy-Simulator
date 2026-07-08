import { useStore } from '../store/useStore'
import logo from '../assets/logo.jpeg'

export default function TopBar() {
  const identity = useStore((s) => s.identity)
  const clearIdentity = useStore((s) => s.clearIdentity)
  const label = identity?.guest ? 'guest' : identity?.name

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-title">orz jar</span>
        <span className="brand-sub">ngminterns</span>
        {/* logo image dropped into the header slot */}
        <img className="logo-slot" src={logo} alt="ngminterns" />
      </div>
      <div className="whoami">
        <span>
          you › <b style={{ color: identity?.color || 'var(--pencil)' }}>{label}</b>
        </span>
        <button className="switch-btn" onClick={clearIdentity}>
          switch
        </button>
      </div>
    </header>
  )
}
