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

import { getRuntimeStatus } from '@/api/plugins'

beforeEach(() => {
  mocks.get.mockReset()
})

describe('api/plugins.getRuntimeStatus — GET /v1/plugins/runtime-status', () => {
  it('requests the runtime-status endpoint', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { available: true, items: [] } })
    await getRuntimeStatus()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get.mock.calls[0][0]).toBe('/v1/plugins/runtime-status')
  })

  it('unwraps the envelope to { available, items }', async () => {
    const payload = {
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1719512345678 }]
    }
    mocks.get.mockResolvedValue({ code: 0, data: payload })
    const res = await getRuntimeStatus()
    expect(res).toEqual(payload)
    expect(res.available).toBe(true)
    expect(res.items[0].registered).toBe(true)
  })

  it('surfaces available=false payload (状态未知) instead of throwing', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { available: false, items: [] } })
    const res = await getRuntimeStatus()
    expect(res).toEqual({ available: false, items: [] })
  })

  it('throws BusinessError-like failure when envelope code != 0', async () => {
    mocks.get.mockResolvedValue({ code: 10600, message: 'boom', data: null })
    await expect(getRuntimeStatus()).rejects.toThrow('boom')
  })
})
