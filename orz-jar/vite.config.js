import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// absolute subpath base: served at doggame.dog/orzjar via a proxy rewrite, so assets
// must resolve to /orzjar/... (relative './' would 404 at the no-trailing-slash url).
// no-router SPA, so no history fallback needed.
export default defineConfig({
  base: '/orzjar/',
  plugins: [react()],
})
