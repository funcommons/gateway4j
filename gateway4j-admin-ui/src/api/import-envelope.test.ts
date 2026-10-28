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

import { validateImport, importRoutes } from '@/api/routes'

beforeEach(() => {
  mocks.get.mockReset()
  mocks.post.mockReset()
  mocks.envelope.mockImplementation(async (p: any) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message ?? '业务失败')
      return r.data
    }
    return r
  })
})

describe('api/routes.validateImport — must unwrap envelope', () => {
  it('uses envelope() to unwrap the { code, data } response', async () => {
    mocks.post.mockResolvedValue({
      code: 0,
      data: {
        is_valid: false,
        conflicts: ['route-A'],
        missing_plugins: ['p1']
      }
    })
    const result: any = await validateImport({ version: '1.0', exported_at: 0, routes: [] } as any)
    expect(result).toEqual({
      is_valid: false,
      conflicts: ['route-A'],
      missing_plugins: ['p1']
    })
    expect(result).not.toHaveProperty('code')
    expect(result).not.toHaveProperty('data')
  })

  it('rejects on non-zero code (envelope propagation)', async () => {
    mocks.post.mockResolvedValue({ code: 10601, message: '包格式错误' })
    await expect(validateImport({} as any)).rejects.toThrow('包格式错误')
  })

  it('POSTs to /v1/routes/import/validate with the raw package body', async () => {
    mocks.post.mockResolvedValue({ code: 0, data: { is_valid: true } })
    const pkg = { version: '1.0', exported_at: 1, routes: [{ route_name: 'A' }] } as any
    await validateImport(pkg)
    const [url, payload] = mocks.post.mock.calls[0]
    expect(url).toBe('/v1/routes/import/validate')
    expect(payload).toBe(pkg)  // raw pkg, NOT wrapped in { data }
  })
})

describe('api/routes.importRoutes — must unwrap envelope and use snake_case fields', () => {
  it('sends { data: pkg, strategy } per API contract', async () => {
    mocks.post.mockResolvedValue({
      code: 0,
      data: { total: 5, created: 3, updated: 1, skipped: 1, errors: [] }
    })
    const pkg = { version: '1.0', exported_at: 0, routes: [] } as any
    await importRoutes(pkg, 'SKIP')
    const [url, payload] = mocks.post.mock.calls[0]
    expect(url).toBe('/v1/routes/import')
    expect(payload).toEqual({ data: pkg, strategy: 'SKIP' })
  })

  it('returns inner data (total/created/updated/skipped/errors) — not the envelope', async () => {
    const innerData = { total: 5, created: 3, updated: 1, skipped: 1, errors: [] }
    mocks.post.mockResolvedValue({ code: 0, data: innerData })
    const result: any = await importRoutes({} as any, 'OVERWRITE')
    expect(result).toEqual(innerData)
    expect(result).not.toHaveProperty('code')
    expect(result).not.toHaveProperty('data')
  })

  it('rejects on non-zero code with server message', async () => {
    mocks.post.mockResolvedValue({ code: 10602, message: '导入校验失败' })
    await expect(importRoutes({} as any, 'ERROR')).rejects.toThrow('导入校验失败')
  })
})
