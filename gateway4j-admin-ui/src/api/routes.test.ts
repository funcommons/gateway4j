import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above imports, so any top-level variables it references
// must be declared with vi.hoisted to also be available at the top.
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

// Import after mocking so the SUT picks up the stub.
import * as api from '@/api/routes'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
  mocks.put.mockReset().mockResolvedValue('PUT_RESULT')
  mocks.patch.mockReset().mockResolvedValue('PATCH_RESULT')
  mocks.del.mockReset().mockResolvedValue('DELETE_RESULT')
})

describe('routes api — list/get/create/update', () => {
  it('listRoutes -> GET /v1/routes', async () => {
    await api.listRoutes()
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes')
  })

  it('getRoute(id) -> GET /v1/routes/:id', async () => {
    await api.getRoute('42')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/42')
  })

  it('createRoute(payload) -> POST /v1/routes with payload', async () => {
    const payload = { route_name: 'r', route_type: 'BACKEND', path: '/api/x' }
    await api.createRoute(payload)
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes', payload)
  })

  it('updateRoute(id, payload) -> PATCH /v1/routes/:id', async () => {
    const payload = { route_name: 'r2' }
    await api.updateRoute('7', payload)
    expect(mocks.patch).toHaveBeenCalledWith('/v1/routes/7', payload)
  })

  it('deleteRoute(id) -> DELETE /v1/routes/:id', async () => {
    await api.deleteRoute('99')
    expect(mocks.del).toHaveBeenCalledWith('/v1/routes/99')
  })
})

describe('routes api — lifecycle', () => {
  it('publishRoute -> POST /v1/routes/:id/publish', async () => {
    await api.publishRoute('5')
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/5/publish')
  })

  it('offlineRoute -> POST /v1/routes/:id/offline', async () => {
    await api.offlineRoute('5')
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/5/offline')
  })

  it('validateRoute -> POST /v1/routes/validate', async () => {
    await api.validateRoute({ conditions: [] })
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/validate', { conditions: [] })
  })

  it('listRouteChildren -> GET /v1/routes/:id/children', async () => {
    await api.listRouteChildren('p')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/p/children')
  })

  it('sortRoutes -> PUT /v1/routes/sort with route_ids', async () => {
    await api.sortRoutes(['a', 'b', 'c'])
    expect(mocks.put).toHaveBeenCalledWith('/v1/routes/sort', { route_ids: ['a', 'b', 'c'] })
  })
})

describe('routes api — canvas', () => {
  it('getCanvas -> GET /v1/routes/:id/canvas', async () => {
    await api.getCanvas('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/r1/canvas')
  })

  it('saveCanvas -> PUT /v1/routes/:id/canvas with canvas_data', async () => {
    const data = { nodes: [{ id: 'a' }] }
    await api.saveCanvas('r1', data)
    expect(mocks.put).toHaveBeenCalledWith('/v1/routes/r1/canvas', { canvas_data: data })
  })
})

describe('routes api — conditions', () => {
  it('addCondition -> POST /v1/routes/:id/conditions', async () => {
    await api.addCondition('r1', { condition_type: 'HEADER', operator: 'EQ' })
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/r1/conditions', {
      condition_type: 'HEADER',
      operator: 'EQ'
    })
  })

  it('updateCondition -> PUT /v1/routes/:id/conditions/:condId', async () => {
    await api.updateCondition('r1', 'c1', { condition_type: 'QUERY', operator: 'NE' })
    expect(mocks.put).toHaveBeenCalledWith('/v1/routes/r1/conditions/c1', {
      condition_type: 'QUERY',
      operator: 'NE'
    })
  })

  it('deleteCondition -> DELETE /v1/routes/:id/conditions/:condId', async () => {
    await api.deleteCondition('r1', 'c1')
    expect(mocks.del).toHaveBeenCalledWith('/v1/routes/r1/conditions/c1')
  })
})

describe('routes api — plugin bindings', () => {
  it('listBindings -> GET /v1/routes/:id/plugins', async () => {
    await api.listBindings('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/r1/plugins')
  })

  it('bindPlugin -> POST /v1/routes/:id/plugins', async () => {
    await api.bindPlugin('r1', { plugin_id: 'p1', binding_config: '{}' })
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/r1/plugins', {
      plugin_id: 'p1',
      binding_config: '{}'
    })
  })

  it('updateBinding -> PUT /v1/routes/:id/plugins/:bindingId', async () => {
    await api.updateBinding('r1', 'b1', { binding_config: '{"k":"v"}', sort_order: 2 })
    expect(mocks.put).toHaveBeenCalledWith('/v1/routes/r1/plugins/b1', {
      binding_config: '{"k":"v"}',
      sort_order: 2
    })
  })

  it('unbindPlugin -> DELETE /v1/routes/:id/plugins/:bindingId', async () => {
    await api.unbindPlugin('r1', 'b1')
    expect(mocks.del).toHaveBeenCalledWith('/v1/routes/r1/plugins/b1')
  })

  it('sortRoutePlugins -> PUT /v1/routes/:id/plugins/sort with phase + ids', async () => {
    await api.sortRoutePlugins('r1', 'PRE', ['b1', 'b2'])
    expect(mocks.put).toHaveBeenCalledWith('/v1/routes/r1/plugins/sort', {
      plugin_phase: 'PRE',
      binding_ids: ['b1', 'b2']
    })
  })

  it('getPluginChain -> GET /v1/routes/:id/plugin-chain', async () => {
    await api.getPluginChain('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/r1/plugin-chain')
  })
})

describe('routes api — import/export', () => {
  it('exportRoutes with ids passes them as snake_case route_ids params', async () => {
    await api.exportRoutes(['a', 'b'], 'PUBLISHED')
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/export', {
      params: { route_ids: ['a', 'b'], status: 'PUBLISHED' }
    })
  })

  it('exportRoutes without filters passes empty params object', async () => {
    await api.exportRoutes()
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes/export', {
      params: {}
    })
  })

  it('validateImport -> POST /v1/routes/import/validate with package', async () => {
    const pkg = { version: '1', exported_at: 0, routes: [] }
    await api.validateImport(pkg as any)
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/import/validate', pkg)
  })

  it('importRoutes -> POST /v1/routes/import with { data, strategy }', async () => {
    const pkg = { version: '1', exported_at: 0, routes: [] }
    await api.importRoutes(pkg as any, 'OVERWRITE')
    expect(mocks.post).toHaveBeenCalledWith('/v1/routes/import', {
      data: pkg,
      strategy: 'OVERWRITE'
    })
  })
})