# orz jar — handoff

A tiny React + Vite SPA (Supabase backend) for 4 friends. A swear-jar for the word
"orz": anyone (except a guest) files a token against whoever said it; 2 approvals tip
it into the shared jar. Live-updating counters + a pending voting queue.

## Run locally
```bash
npm install
cp .env.example .env      # then paste the Supabase URL + publishable key
npm run dev               # http://localhost:5173
```

## Environment (`.env`)
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...     # PUBLISHABLE key only — never the secret key
```
`VITE_*` vars are inlined into the bundle at build time (they're meant to be public;
safety is RLS, not secrecy).

## Database
One-time: open the Supabase SQL editor and run `schema.sql` (idempotent). It creates
`members` / `tokens` / `votes`, the vote-resolution trigger, the `member_counts` +
`pending_tokens` views, the pin-safe `members_public` view + `verify_pin` RPC,
realtime publication, and permissive RLS. 4 members are seeded at PIN `0000`.

Smoke-test the backend anytime: `node scripts/smoke.mjs` (inserts a test token,
drives it to approved, cleans up).

## Build + deploy at a subpath
```bash
npm run build             # outputs static files to dist/
```
`vite.config.js` sets `base: './'`, so the built asset paths are **relative** — drop
the contents of `dist/` at **any** path (e.g. `www.example.com/orzjar/`) with no
rebuild. It's a no-router SPA, so there's no history-fallback/deep-link config needed.
Make sure the same two env vars are set in whatever environment runs `npm run build`.

## How it works (quick map)
- `src/App.jsx` — no router; shows `IdentityGate` until an identity is chosen, else `JarPage`.
- `src/store/useStore.js` — Zustand; identity persisted to localStorage, live data hydrated from Supabase.
- `src/hooks/useRealtime.js` — one channel on `tokens`+`votes`, debounced refetch (server is source of truth).
- `src/lib/api.js` — all reads/mutations. `src/lib/supabase.js` — client.
- `src/constants.js` — the 4 members, their colors (Marginalia palette), and the `where` options.
- Voting: submitting a token auto-counts as the submitter's approve (DB trigger), so 1 more
  approve → jar; 2 rejects → discarded. Everyone (incl. the accused) can vote once, changeable.

## Security notes (READ before opening to the public)
- **v1 RLS is permissive**: anyone with the publishable key can read/write. Fine for 4 friends.
- The PIN gate is a **friendly UX gate, not real auth** — with only the anon key,
  `voter`/`submitted_by`/`culprit` are client-asserted. For integrity, switch to Supabase
  Auth and derive identity from `auth.uid()` in RLS `with check`.
- **Rotate the Supabase secret key** if it was ever shared; it's not used by this app.

## Deferred (intentionally not done in the POC)
- Mobile/responsive pass (layout uses relative units + one stacking breakpoint as groundwork).
- Free-tier load tuning beyond the current lean setup (single throttled channel, small/capped columns).
- Real per-person PINs (all `0000` for now — change in the `members` table).
