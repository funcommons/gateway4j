import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import * as api from '@/api/misc'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
  mocks.put.mockReset().mockResolvedValue('PUT_RESULT')
  mocks.patch.mockReset().mockResolvedValue('PATCH_RESULT')
  mocks.del.mockReset().mockResolvedValue('DELETE_RESULT')
})

describe('misc api — dict', () => {
  it('getDict(code) -> GET /v1/dict/:code', async () => {
    await api.getDict('route_status')
    expect(mocks.get).toHaveBeenCalledWith('/v1/dict/route_status')
  })
})

describe('misc api — monitor', () => {
  it('listRouteStatus() -> GET /v1/monitor/routes/status with no route_id when omitted', async () => {
    await api.listRouteStatus()
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/routes/status', {
      params: {}
    })
  })

  it('listRouteStatus(id) -> GET /v1/monitor/routes/status with snake_case route_id param', async () => {
    await api.listRouteStatus('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/routes/status', {
      params: { route_id: 'r1' }
    })
  })

  it('getRouteMetrics uses defaults 1h / 1m', async () => {
    await api.getRouteMetrics('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/routes/r1/metrics', {
      params: { time_range: '1h', granularity: '1m' }
    })
  })

  it('getRouteMetrics honors timeRange + granularity overrides', async () => {
    await api.getRouteMetrics('r1', '24h', '1h')
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/routes/r1/metrics', {
      params: { time_range: '24h', granularity: '1h' }
    })
  })

  it('getTopology -> GET /v1/monitor/topology', async () => {
    await api.getTopology()
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/topology')
  })
})

describe('misc api — user CRUD', () => {
  it('listUsers -> GET /v1/users with snake_case pagination params', async () => {
    await api.listUsers({ page: 1, pageSize: 20, keyword: 'al' })
    expect(mocks.get).toHaveBeenCalledWith('/v1/users', {
      params: { page: 1, page_size: 20, keyword: 'al' }
    })
  })

  it('createUser -> POST /v1/users with payload', async () => {
    const payload = { username: 'u', password: 'p', role_codes: ['admin'] }
    await api.createUser(payload)
    expect(mocks.post).toHaveBeenCalledWith('/v1/users', payload)
  })

  it('updateUser -> PATCH /v1/users/:id with payload', async () => {
    const payload = { real_name: 'Alice' }
    await api.updateUser('u1', payload)
    expect(mocks.patch).toHaveBeenCalledWith('/v1/users/u1', payload)
  })

  it('deleteUser -> DELETE /v1/users/:id', async () => {
    await api.deleteUser('u1')
    expect(mocks.del).toHaveBeenCalledWith('/v1/users/u1')
  })

  it('resetPassword -> POST /v1/users/:id/reset-password with new_password', async () => {
    await api.resetPassword('u1', 'new-pw')
    expect(mocks.post).toHaveBeenCalledWith('/v1/users/u1/reset-password', {
      new_password: 'new-pw'
    })
  })
})

describe('misc api — changes (T3 变更记录)', () => {
  it('listChanges() -> GET /v1/changes with default limit 50', async () => {
    await api.listChanges()
    expect(mocks.get).toHaveBeenCalledWith('/v1/changes', { params: { limit: 50 } })
  })

  it('listChanges(10) -> GET /v1/changes with explicit limit', async () => {
    await api.listChanges(10)
    expect(mocks.get).toHaveBeenCalledWith('/v1/changes', { params: { limit: 10 } })
  })
})