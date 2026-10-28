import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock http + envelope so we can intercept request payload and envelope unwrap behavior
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  envelope: vi.fn()
}))

vi.mock('./http', () => ({
  http: {
    post: mocks.post,
    get: vi.fn()
  },
  envelope: mocks.envelope
}))

import { refreshToken, login } from '@/api/auth'

beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue({ data: {} })
  // emulate real envelope behavior:
  //   in production, http's response interceptor strips one level (returns r.data).
  //   envelope receives { code, data } and returns inner `data`.
  // To keep tests simple, we let mocks.post return what the post-interceptor would yield
  // (i.e., the inner envelope object), and envelope extracts .data from it.
  mocks.envelope.mockImplementation(async (p: any) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message ?? '业务失败')
      return r.data
    }
    return r
  })
})

describe('api/auth.ts — refreshToken field naming', () => {
  it('sends refresh_token (snake_case) matching API contract', async () => {
    mocks.post.mockResolvedValue({
      code: 0,
      data: {
        user_id: '1', username: 'u', roles: [],
        access_token: 'NEW', refresh_token: 'NEW_RT', expires_in: 7200
      }
    })
    await refreshToken('OLD_RT')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    const [url, payload] = mocks.post.mock.calls[0]
    expect(url).toBe('/v1/auth/refresh')
    // CRITICAL: API contract specifies snake_case "refresh_token"
    expect(payload).toEqual({ refresh_token: 'OLD_RT' })
    expect(payload).not.toHaveProperty('refreshToken')
  })

  it('login also uses snake_case fields (regression check)', async () => {
    mocks.post.mockResolvedValue({
      code: 0,
      data: {
        user_id: '1', username: 'u', roles: [],
        access_token: 'T', refresh_token: 'RT', expires_in: 7200
      }
    })
    await login('alice', 'pw123')
    const [, payload] = mocks.post.mock.calls[0]
    expect(payload).toEqual({ username: 'alice', password: 'pw123' })
  })
})

describe('api/auth.ts — response unwrapping consistency', () => {
  it('refreshToken return value is the inner data object (envelope unwrapped)', async () => {
    const innerData = {
      user_id: '1', username: 'u', roles: [],
      access_token: 'NEW', refresh_token: 'NEW_RT', expires_in: 7200
    }
    mocks.post.mockResolvedValue({ code: 0, data: innerData })
    const result: any = await refreshToken('OLD_RT')
    expect(result).toEqual(innerData)
  })

  it('refreshToken propagates envelope rejection on non-zero code', async () => {
    mocks.post.mockResolvedValue({ code: 10101, message: 'refresh_token expired' })
    await expect(refreshToken('EXPIRED')).rejects.toThrow('refresh_token expired')
  })
})
