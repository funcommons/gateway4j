import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  envelope: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: mocks.post, put: mocks.put },
  envelope: mocks.envelope
}))

import { listPlugins } from '@/api/plugins'

beforeEach(() => {
  mocks.get.mockReset()
  mocks.envelope.mockImplementation(async (p: any) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message ?? '业务失败')
      return r.data
    }
    return r
  })
})

describe('api/plugins.listPlugins — must unwrap envelope', () => {
  it('uses envelope() to unwrap the { code, data } paginated response', async () => {
    mocks.get.mockResolvedValue({
      code: 0,
      data: {
        records: [{ id: '1', plugin_name: 'RateLimiter' }],
        total: 1,
        size: 20,
        current: 1,
        pages: 1
      }
    })
    const result: any = await listPlugins({ page: 1, pageSize: 20 })
    expect(result.records).toEqual([{ id: '1', plugin_name: 'RateLimiter' }])
    expect(result.total).toBe(1)
    expect(result).not.toHaveProperty('code')
  })
})
