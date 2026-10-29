import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  envelope: async <T,>(p: Promise<{ code?: number; data?: T; message?: string }>) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message || 'business error')
      return r.data as T
    }
    return r as T
  }
}))

import { getSyncStatus } from '@/api/misc'

beforeEach(() => {
  mocks.get.mockReset()
})

describe('api/misc.getSyncStatus — GET /v1/config/sync-status (P1-3 契约)', () => {
  it('requests the sync-status endpoint with GET', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { available: true, gateway: null, db_version: 1, in_sync: false } })
    await getSyncStatus()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get.mock.calls[0][0]).toBe('/v1/config/sync-status')
  })

  it('unwraps the envelope to the { available, gateway, db_version, in_sync } shape', async () => {
    const payload = {
      available: true,
      gateway: { version: 42, fingerprint: 'abc123', updated_at: 1769900000000, instance: 'gw-1' },
      db_version: 42,
      in_sync: true
    }
    mocks.get.mockResolvedValue({ code: 0, data: payload })
    const res = await getSyncStatus()
    expect(res).toEqual(payload)
    expect(res.in_sync).toBe(true)
    expect(res.gateway?.fingerprint).toBe('abc123')
  })

  it('available=false → gateway 为 null（契约），in_sync 原样透传', async () => {
    const payload = { available: false, gateway: null, db_version: 7, in_sync: false }
    mocks.get.mockResolvedValue({ code: 0, data: payload })
    const res = await getSyncStatus()
    expect(res.available).toBe(false)
    expect(res.gateway).toBeNull()
    expect(res.in_sync).toBe(false)
  })

  it('非 0 业务码时抛错（调用方按不可用降级处理）', async () => {
    mocks.get.mockResolvedValue({ code: 10400, message: 'not found', data: null })
    await expect(getSyncStatus()).rejects.toThrow('not found')
  })
})
