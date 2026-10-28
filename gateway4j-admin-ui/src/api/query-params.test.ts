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
import * as pluginsApi from '@/api/plugins'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
})

describe('api/misc.listUsers — query params must be snake_case (API contract)', () => {
  it('sends page_size (not pageSize) per API contract', async () => {
    await api.listUsers({ page: 1, pageSize: 20 })
    expect(mocks.get).toHaveBeenCalledTimes(1)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/users')
    const params = opts.params
    expect(params).toEqual({ page: 1, page_size: 20 })
    expect(params).not.toHaveProperty('pageSize')
  })

  it('sends status and keyword as-is (already snake_case)', async () => {
    await api.listUsers({ page: 2, pageSize: 10, status: 'ENABLED', keyword: 'admin' })
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params).toEqual({
      page: 2,
      page_size: 10,
      status: 'ENABLED',
      keyword: 'admin'
    })
  })

  it('omits optional filters when not provided (no undefined values)', async () => {
    await api.listUsers({ page: 1, pageSize: 20 })
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params.status).toBeUndefined()
    expect(opts.params.keyword).toBeUndefined()
  })
})

describe('api/plugins.listPlugins — query params must be snake_case (API contract)', () => {
  it('sends page_size (not pageSize) per API contract', async () => {
    await pluginsApi.listPlugins({ page: 1, pageSize: 20 })
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params).toEqual({ page: 1, page_size: 20 })
    expect(opts.params).not.toHaveProperty('pageSize')
  })

  it('sends plugin_type, plugin_phase as snake_case (not camelCase)', async () => {
    await pluginsApi.listPlugins({
      page: 1,
      pageSize: 20,
      pluginType: 'GROOVY',
      pluginPhase: 'PRE',
      scope: 'GLOBAL',
      status: 'ENABLED'
    })
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params).toEqual({
      page: 1,
      page_size: 20,
      plugin_type: 'GROOVY',
      plugin_phase: 'PRE',
      scope: 'GLOBAL',
      status: 'ENABLED'
    })
    expect(opts.params).not.toHaveProperty('pluginType')
    expect(opts.params).not.toHaveProperty('pluginPhase')
  })
})
