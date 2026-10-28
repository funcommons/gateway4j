import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  envelope: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { post: mocks.post, patch: mocks.patch, put: vi.fn(), get: vi.fn(), delete: vi.fn() },
  envelope: mocks.envelope
}))

import { createRoute, updateRoute } from '@/api/routes'

beforeEach(() => {
  mocks.post.mockReset()
  mocks.patch.mockReset()
  mocks.envelope.mockImplementation(async (p: any) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message ?? '业务失败')
      return r.data
    }
    return r
  })
})

describe('api/routes.createRoute — must unwrap envelope so caller can read r.id', () => {
  it('returns inner data (route object with id) after envelope unwrap', async () => {
    const innerRoute = { id: 'r-abc', route_name: 'A', route_type: 'BACKEND' }
    mocks.post.mockResolvedValue({ code: 0, data: innerRoute })
    const result: any = await createRoute({
      route_name: 'A', route_type: 'BACKEND'
    } as any)
    expect(result).toEqual(innerRoute)
    expect(result.id).toBe('r-abc')
    expect(result).not.toHaveProperty('code')
    expect(result).not.toHaveProperty('data')
  })

  it('rejects on non-zero code (server-side validation error)', async () => {
    mocks.post.mockResolvedValue({ code: 10601, message: 'route_name 已存在' })
    await expect(createRoute({ route_name: 'dup' } as any)).rejects.toThrow('route_name 已存在')
  })

  it('POSTs to /v1/routes with raw payload (no envelope wrap on request side)', async () => {
    mocks.post.mockResolvedValue({ code: 0, data: { id: 'r1' } })
    const payload = {
      route_name: 'A',
      route_type: 'BACKEND',
      path: '/p',
      upstream_url: 'http://b',
      conditions: [],
      bindings: []
    }
    await createRoute(payload as any)
    const [url, body] = mocks.post.mock.calls[0]
    expect(url).toBe('/v1/routes')
    expect(body).toEqual(payload)
  })
})

describe('api/routes.updateRoute — for consistency should also unwrap envelope', () => {
  it('returns inner data after envelope unwrap', async () => {
    const innerRoute = { id: 'r1', route_name: 'updated', status: 'DRAFT' }
    mocks.patch.mockResolvedValue({ code: 0, data: innerRoute })
    const result: any = await updateRoute('r1', { route_name: 'updated' } as any)
    expect(result).toEqual(innerRoute)
    expect(result).not.toHaveProperty('code')
  })

  it('rejects on non-zero code', async () => {
    mocks.patch.mockResolvedValue({ code: 10603, message: '上游 URL 不合法' })
    await expect(updateRoute('r1', {} as any)).rejects.toThrow('上游 URL 不合法')
  })
})
