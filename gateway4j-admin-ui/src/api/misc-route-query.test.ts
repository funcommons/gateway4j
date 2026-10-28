import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: mocks.post },
  envelope: <T>(p: Promise<T>) => p
}))

import * as api from '@/api/misc'
import * as routesApi from '@/api/routes'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
})

describe('api/misc.listRouteStatus — query params must be snake_case (API contract)', () => {
  it('sends route_id (not routeId) per API contract', async () => {
    await api.listRouteStatus('r1')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/monitor/routes/status')
    expect(opts.params).toEqual({ route_id: 'r1' })
    expect(opts.params).not.toHaveProperty('routeId')
  })

  it('omits route_id when not provided (no undefined sent as param)', async () => {
    await api.listRouteStatus()
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params.route_id).toBeUndefined()
  })

  it('omits route_id when explicitly undefined', async () => {
    await api.listRouteStatus(undefined)
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params.route_id).toBeUndefined()
  })
})

describe('api/routes.exportRoutes — query params must be snake_case (API contract)', () => {
  it('sends route_ids (not routeIds) per API contract', async () => {
    await routesApi.exportRoutes(['r1', 'r2'])
    expect(mocks.get).toHaveBeenCalledTimes(1)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/routes/export')
    expect(opts.params).toEqual({ route_ids: ['r1', 'r2'] })
    expect(opts.params).not.toHaveProperty('routeIds')
  })

  it('sends status filter (snake_case already)', async () => {
    await routesApi.exportRoutes(['r1'], 'DRAFT')
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params).toEqual({ route_ids: ['r1'], status: 'DRAFT' })
  })

  it('omits route_ids when not provided', async () => {
    await routesApi.exportRoutes()
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params.route_ids).toBeUndefined()
  })
})
