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

  // P4f C2：listGlobalPlugins 用例随 api/plugins.ts 同步拆除（旧树 Global.vue 摘除）
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
    const payload = { plugin_name: 'p', plugin_id: 'p1', plugin_type: 'BUILTIN' as const }
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

// ═══ P4a-1-T 追加：六桥接函数契约补全（getPlugin + create/update 的 FormData 形态）═══
// 契约：docs/ui-v2/实施契约.md §4 P4 表 P4a 行裁决③ —— v2 编辑器页/市场区依赖的桥接面。
// getPlugin / validateConfig / validateGroovy / getBuiltinSchema / updatePlugin(JSON) /
// deletePlugin 端点既有用例已覆盖；本段补：getPlugin 端点 + JSON 之外的 FormData 分支
// （JAR 上传走 multipart：create=POST、update=PATCH，Content-Type 显式 multipart/form-data）。
describe('plugins api — P4a-1 桥接补全（getPlugin + FormData 形态）', () => {
  it('getPlugin -> GET /v1/plugins/:id（行主键）', async () => {
    await api.getPlugin('7001')
    expect(mocks.get).toHaveBeenCalledWith('/v1/plugins/7001')
  })

  it('createPlugin(FormData) -> POST /v1/plugins with multipart/form-data header', async () => {
    const fd = new FormData()
    fd.append('plugin_id', 'my-plugin')
    fd.append('jar_file', new File([new Uint8Array(4)], 'a.jar'))
    await api.createPlugin(fd)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith('/v1/plugins', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  })

  it('updatePlugin(id, FormData) -> PATCH /v1/plugins/:id with multipart/form-data header', async () => {
    const fd = new FormData()
    fd.append('jar_file', new File([new Uint8Array(4)], 'b.jar'))
    await api.updatePlugin('7001', fd)
    expect(mocks.patch).toHaveBeenCalledTimes(1)
    expect(mocks.patch).toHaveBeenCalledWith('/v1/plugins/7001', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  })

  it('updatePlugin(id, payload) -> PATCH /v1/plugins/:id 无 multipart 头（JSON 分支不受 FormData 分支影响）', async () => {
    await api.updatePlugin('7001', { config: '{}' })
    expect(mocks.patch).toHaveBeenCalledWith('/v1/plugins/7001', { config: '{}' })
    const call = mocks.patch.mock.calls[0]
    expect(call[2]).toBeUndefined()
  })
})