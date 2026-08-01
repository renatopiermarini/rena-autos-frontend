'use client'
import { useEffect, useState } from 'react'

/**
 * Reads `?id=` from the URL once, on mount — "open the record the agenda sent me to".
 *
 * Deliberately not `useSearchParams`: that opts the whole subtree into a Suspense
 * boundary requirement at build time, and this is a one-shot read, not a value the
 * page needs to stay subscribed to. Returns null when absent or non-numeric.
 */
export function useDeepLinkId(): number | null {
  const [id, setId] = useState<number | null>(null)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('id')
    if (!raw) return
    const n = Number(raw)
    if (Number.isFinite(n)) setId(n)
  }, [])
  return id
}

/**
 * Reads a `YYYY-MM-DD` query param once, on mount. Same one-shot, client-only
 * contract as `useDeepLinkId` — read after mount so the server render stays stable.
 */
export function useDeepLinkDay(param = 'd'): string | null {
  const [day, setDay] = useState<string | null>(null)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(param)
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) setDay(raw)
  }, [param])
  return day
}

/** Scrolls a deep-linked row into view once it has rendered. */
export function useScrollToDeepLink(id: number | null, prefix = 'row') {
  useEffect(() => {
    if (id == null) return
    const el = document.getElementById(`${prefix}-${id}`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [id, prefix])
}
