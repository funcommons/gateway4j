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

import * as api from '@/api/plugins'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
  mocks.put.mockReset().mockResolvedValue('PUT_RESULT')
  mocks.patch.mockReset().mockResolvedValue('PATCH_RESULT')
  mocks.del.mockReset().mockResolvedValue('DELETE_RESULT')
})

describe('plugins api — list', () => {
  it('listPlugins -> GET /v1/plugins with snake_case params', async () => {
    await api.listPlugins({ page: 1, pageSize: 20, pluginType: 'BUILTIN' })
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins', {
      params: { page: 1, page_size: 20, plugin_type: 'BUILTIN' }
    })
  })

  it('listGlobalPlugins (no phase) -> GET /v1/plugins/global with empty params', async () => {
    await api.listGlobalPlugins()
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins/global', { params: {} })
  })

  it('listGlobalPlugins(phase) -> GET /v1/plugins/global with snake_case plugin_phase', async () => {
    await api.listGlobalPlugins('PRE')
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins/global', { params: { plugin_phase: 'PRE' } })
  })

  it('sortGlobalPlugins -> PUT /v1/plugins/global/sort', async () => {
    await api.sortGlobalPlugins('POST', ['a', 'b'])
    expect(mocks.put).toHaveBeenCalledWith('/v1/plugins/global/sort', {
      plugin_phase: 'POST',
      plugin_ids: ['a', 'b']
    })
  })
})

describe('plugins api — CRUD', () => {
  it('createPlugin -> POST /v1/plugins with payload', async () => {
    const payload = { plugin_name: 'p', plugin_id: 'p1', plugin_type: 'BUILTIN' }
    await api.createPlugin(payload)
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins', payload)
  })

  it('updatePlugin -> PATCH /v1/plugins/:id with payload', async () => {
    const payload = { plugin_name: 'p2' }
    await api.updatePlugin('11', payload)
    expect(mocks.patch).toHaveBeenCalledWith('/v1/plugins/11', payload)
  })

  it('deletePlugin -> DELETE /v1/plugins/:id', async () => {
    await api.deletePlugin('11')
    expect(mocks.del).toHaveBeenCalledWith('/v1/plugins/11')
  })

  it('enablePlugin -> POST /v1/plugins/:id/enable', async () => {
    await api.enablePlugin('11')
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins/11/enable')
  })

  it('disablePlugin -> POST /v1/plugins/:id/disable', async () => {
    await api.disablePlugin('11')
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins/11/disable')
  })
})

describe('plugins api — builtin + validation', () => {
  it('listBuiltinTypes -> GET /v1/plugins/builtin-types', async () => {
    await api.listBuiltinTypes()
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins/builtin-types')
  })

  it('getBuiltinSchema -> GET /v1/plugins/builtin-types/:id/schema', async () => {
    await api.getBuiltinSchema('rate-limit')
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins/builtin-types/rate-limit/schema')
  })

  it('validateConfig -> POST /v1/plugins/validate-config with { plugin_id, config }', async () => {
    await api.validateConfig('rate-limit', '{"limit":100}')
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins/validate-config', {
      plugin_id: 'rate-limit',
      config: '{"limit":100}'
    })
  })

  it('validateGroovy -> POST /v1/plugins/validate-groovy with script_content', async () => {
    await api.validateGroovy('println "hi"')
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins/validate-groovy', {
      script_content: 'println "hi"'
    })
  })
})