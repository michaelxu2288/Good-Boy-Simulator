import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// one store: identity (persisted to localStorage) + live jar data (hydrated from
// supabase, never persisted). selectors give per-component subscriptions so a
// realtime tick doesn't re-render the whole tree.
export const useStore = create(
  persist(
    (set) => ({
      // identity: { id, name, color } for a member, or { guest: true }, or null
      identity: null,
      setIdentity: (identity) => set({ identity }),
      clearIdentity: () => set({ identity: null }),

      // live data slice
      approvedTokens: [], // newest-first
      counts: {},         // { michael: 12, james: 8, ... }
      pending: [],        // [{ ...token, approves, rejects, myVote }]
      loaded: false,
      setData: (patch) => set(patch),
    }),
    {
      name: 'orzjar.identity',
      // sessionStorage = per-TAB identity, so you can sign in as a different person
      // in each browser tab and test the multi-person voting flow solo. survives a
      // reload, not a tab close. (swap to localStorage later for cross-session persist.)
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ identity: s.identity }), // persist ONLY identity
    },
  ),
)
