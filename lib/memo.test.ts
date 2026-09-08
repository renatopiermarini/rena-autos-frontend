import { describe, it, expect, beforeEach } from 'vitest'
import { memoTtl, memoInvalidar, __memoSize } from './memo'

describe('memoTtl', () => {
  beforeEach(() => memoInvalidar())

  it('dentro del TTL devuelve la misma promesa sin volver a llamar', async () => {
    let calls = 0
    const fn = async () => ++calls
    expect(await memoTtl('a', 1000, fn, 0)).toBe(1)
    expect(await memoTtl('a', 1000, fn, 500)).toBe(1)
    expect(calls).toBe(1)
  })

  it('vencido el TTL vuelve a llamar', async () => {
    let calls = 0
    const fn = async () => ++calls
    await memoTtl('a', 1000, fn, 0)
    expect(await memoTtl('a', 1000, fn, 1001)).toBe(2)
  })

  it('un rechazo no queda cacheado', async () => {
    let calls = 0
    const fn = async () => { calls++; if (calls === 1) throw new Error('red'); return 'ok' }
    await expect(memoTtl('a', 1000, fn, 0)).rejects.toThrow('red')
    expect(await memoTtl('a', 1000, fn, 1)).toBe('ok')
  })

  it('memoInvalidar por clave y total', async () => {
    await memoTtl('a', 1000, async () => 1, 0)
    await memoTtl('b', 1000, async () => 2, 0)
    memoInvalidar('a')
    expect(__memoSize()).toBe(1)
    memoInvalidar()
    expect(__memoSize()).toBe(0)
  })
})
