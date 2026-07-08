import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import { fetchAll } from '../lib/api'

// one realtime channel, alive only while the jar page is mounted. the resolution
// trigger mutates token status server-side, so we can't reliably predict outcomes
// on the client -- treat the server as truth and just refetch (debounced) whenever
// tokens or votes change. the debounce collapses the trigger's insert->vote->status
// cascade into a single refetch.
export function useRealtime() {
  const identityId = useStore((s) => s.identity?.id ?? null)
  const setData = useStore((s) => s.setData)
  const timer = useRef()

  useEffect(() => {
    let alive = true
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        const data = await fetchAll(identityId)
        if (alive) setData(data)
      }, 150)
    }

    refresh() // initial hydrate

    const channel = supabase
      .channel('orzjar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, refresh)
      .subscribe()

    return () => {
      alive = false
      clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [identityId, setData])
}
