import { describe, it, expect, vi, beforeEach } from 'vitest'

// H7b 契约用例：环境维度 API 层（请求形状 + envelope 解包）
const mocks = vi.hoisted(() => {
  const get = vi.fn()
  const post = vi.fn()
  const put = vi.fn()
  const patch = vi.fn()
  const del = vi.fn()
  return { get, post, put, patch, del }
})

vi.mock('@/api/http', () => ({
  http: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    patch: mocks.patch,
    delete: mocks.del
  },
  envelope: <T>(p: Promise<T>) => p
}))

import * as api from '@/api/environment'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
})

describe('environment api — GET /v1/environments（契约 1）', () => {
  it('无参 GET，返回信封载荷原样透传', async () => {
    const res = await api.listEnvironments()
    expect(mocks.get).toHaveBeenCalledWith('/v1/environments')
    expect(res).toBe('GET_RESULT')
  })
})

describe('environment api — GET /v1/routes/environment-diff（契约 6）', () => {
  it('from/to 作为查询参数传递', async () => {
    await api.getEnvironmentDiff('default', 'staging')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/environment-diff', {
      params: { from: 'default', to: 'staging' }
    })
  })

  it('结果类型形状：三段 only_in_from / only_in_to / changed', async () => {
    mocks.get.mockResolvedValue({
      from: 'default',
      to: 'staging',
      only_in_from: ['a'],
      only_in_to: [{ route_name: 'b' }],
      changed: [{ route_name: 'c', fields: { path: { from: '/a', to: '/b' } } }]
    })
    const res = await api.getEnvironmentDiff('default', 'staging')
    expect(res.only_in_from).toEqual(['a'])
    expect(res.changed[0].fields.path.from).toBe('/a')
  })
})
