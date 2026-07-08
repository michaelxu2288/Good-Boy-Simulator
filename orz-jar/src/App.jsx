import { useStore } from './store/useStore'
import IdentityGate from './screens/IdentityGate'
import JarPage from './screens/JarPage'

// state-driven screens (no router) so the app deploys cleanly at any subpath.
export default function App() {
  const identity = useStore((s) => s.identity)
  return identity ? <JarPage /> : <IdentityGate />
}
