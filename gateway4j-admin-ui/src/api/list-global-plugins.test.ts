import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: mocks.post },
  envelope: <T>(p: Promise<T>) => p
}))

import * as api from '@/api/plugins'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
})

describe('api/plugins.listGlobalPlugins — query params must be snake_case (API contract)', () => {
  it('with pluginPhase=PRE sends plugin_phase (snake_case)', async () => {
    await api.listGlobalPlugins('PRE')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/plugins/global')
    expect(opts).toEqual({ params: { plugin_phase: 'PRE' } })
  })

  it('does NOT use camelCase pluginPhase in query string', async () => {
    await api.listGlobalPlugins('POST')
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts.params).not.toHaveProperty('pluginPhase')
    // ensure no manual URL building leaked camelCase
    const url = mocks.get.mock.calls[0][0]
    expect(url).not.toContain('pluginPhase=')
  })

  it('omits plugin_phase when not provided', async () => {
    await api.listGlobalPlugins()
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/plugins/global')
    expect(opts.params).toEqual({})
  })

  it('omits plugin_phase when explicitly undefined', async () => {
    await api.listGlobalPlugins(undefined)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/plugins/global')
    expect(opts.params).toEqual({})
  })

  it('uses params object (not manual URL string concatenation)', async () => {
    await api.listGlobalPlugins('PRE')
    const [, opts] = mocks.get.mock.calls[0]
    // Verify the URL doesn't have ?plugin_phase=PRE appended manually
    const url = mocks.get.mock.calls[0][0]
    expect(url).not.toContain('?')
    // params object is the way to go (axios handles encoding)
    expect(opts).toHaveProperty('params')
  })
})
