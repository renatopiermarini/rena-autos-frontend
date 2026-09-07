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

/**
 * ¿Viene `?<param>=1` (o `true`/`si`) en la URL? Puro, para testear en node:
 * los hooks de abajo sólo le pasan `window.location.search`.
 */
export function leerDeepLinkFlag(search: string, param: string): boolean {
  const raw = (new URLSearchParams(search).get(param) ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'si' || raw === 'sí'
}

/** El valor de `?<param>=` recortado, o null si no está o está vacío. Puro. */
export function leerDeepLinkParam(search: string, param: string): string | null {
  const raw = (new URLSearchParams(search).get(param) ?? '').trim()
  return raw ? raw : null
}

/**
 * `?dni=1`: "abrí la ficha con el dropzone del DNI a la vista". Mismo contrato
 * one-shot y client-only que `useDeepLinkId`.
 */
export function useDeepLinkFlag(param: string): boolean {
  const [flag, setFlag] = useState(false)
  useEffect(() => {
    if (leerDeepLinkFlag(window.location.search, param)) setFlag(true)
  }, [param])
  return flag
}

/**
 * `?rapido=<texto>`: la otra pantalla de agenda manda la frase para que ésta
 * la ejecute al montar. Se lee UNA vez; el que la consume la borra de la URL
 * (replaceState) para que un F5 no vuelva a crear lo mismo.
 */
export function useDeepLinkParam(param: string): string | null {
  const [valor, setValor] = useState<string | null>(null)
  useEffect(() => {
    const v = leerDeepLinkParam(window.location.search, param)
    if (v !== null) setValor(v)
  }, [param])
  return valor
}

/** Saca `param` de la URL sin navegar (para que un F5 no repita un one-shot). */
export function limpiarDeepLinkParam(param: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(param)) return
  url.searchParams.delete(param)
  window.history.replaceState(window.history.state, '', url.toString())
}

/** Scrolls a deep-linked row into view once it has rendered. */
export function useScrollToDeepLink(id: number | null, prefix = 'row') {
  useEffect(() => {
    if (id == null) return
    const el = document.getElementById(`${prefix}-${id}`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [id, prefix])
}
