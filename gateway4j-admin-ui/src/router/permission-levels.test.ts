import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, './index.ts'), 'utf-8')

/**
 * 权限分级护栏（P4f C2 起对 v2 路由表断言；旧表语义随摘树迁移）：
 * 写操作路由必须要求 :edit（不能只挂 :read），列表/详情等只读路由必须保持 :read。
 */
describe('Router permission levels', () => {
  it('V2RouteWizard (routes/wizard) requires route:edit (not just route:read)', () => {
    const row = source.match(/path: 'routes\/wizard'[^}]*}/s)
    expect(row).toBeTruthy()
    expect(row![0]).toMatch(/permission: 'route:edit'/)
  })

  it('V2Canvas (routes/canvas/:id) requires route:edit (not just route:read)', () => {
    const row = source.match(/path: 'routes\/canvas\/:id'[^}]*}/s)
    expect(row).toBeTruthy()
    expect(row![0]).toMatch(/permission: 'route:edit'/)
  })

  it('V2Publish (publish/:id) requires route:edit (not just route:read)', () => {
    const row = source.match(/path: 'publish\/:id'[^}]*}/s)
    expect(row).toBeTruthy()
    expect(row![0]).toMatch(/permission: 'route:edit'/)
  })

  it('V2PluginEditor (plugins/editor/:id?) requires plugin:edit (not just plugin:read)', () => {
    const row = source.match(/path: 'plugins\/editor\/:id\?'[^}]*}/s)
    expect(row).toBeTruthy()
    expect(row![0]).toMatch(/permission: 'plugin:edit'/)
  })

  it('read-only routes still use :read permission', () => {
    // Routes list, plugins list, route detail 等只读页保持 :read
    expect(source).toMatch(/path: 'routes'[^}]*permission: 'route:read'/s)
    expect(source).toMatch(/path: 'plugins'[^}]*permission: 'plugin:read'/s)
    expect(source).toMatch(/path: 'routes\/:id\/detail'[^}]*permission: 'route:read'/s)
  })
})
