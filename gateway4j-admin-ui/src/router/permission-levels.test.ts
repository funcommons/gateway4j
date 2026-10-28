import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../router/index.ts'), 'utf-8')

describe('Router permission levels', () => {
  it('RouteNew requires route:edit (not just route:read)', () => {
    const newRoute = source.match(/path: 'routes\/new'[^}]*}/s)
    expect(newRoute).toBeTruthy()
    expect(newRoute![0]).toMatch(/permission: 'route:edit'/)
  })

  it('RouteEdit requires route:edit (not just route:read)', () => {
    const editRoute = source.match(/path: 'routes\/:id'[^}]*name: 'RouteEdit'[^}]*}/s)
    expect(editRoute).toBeTruthy()
    expect(editRoute![0]).toMatch(/permission: 'route:edit'/)
  })

  it('RouteCanvas requires route:edit (not just route:read)', () => {
    const canvasRoute = source.match(/path: 'routes\/:id\/canvas'[^}]*}/s)
    expect(canvasRoute).toBeTruthy()
    expect(canvasRoute![0]).toMatch(/permission: 'route:edit'/)
  })

  it('PluginNew requires plugin:edit (not just plugin:read)', () => {
    const newPlugin = source.match(/path: 'plugins\/new'[^}]*}/s)
    expect(newPlugin).toBeTruthy()
    expect(newPlugin![0]).toMatch(/permission: 'plugin:edit'/)
  })

  it('PluginEdit requires plugin:edit (not just plugin:read)', () => {
    const editPlugin = source.match(/path: 'plugins\/:id\/edit'[^}]*}/s)
    expect(editPlugin).toBeTruthy()
    expect(editPlugin![0]).toMatch(/permission: 'plugin:edit'/)
  })

  it('read-only routes still use :read permission', () => {
    // Routes list, plugins list, etc. should still use :read
    expect(source).toMatch(/path: 'routes'[^}]*permission: 'route:read'/s)
    expect(source).toMatch(/path: 'plugins'[^}]*permission: 'plugin:read'/s)
  })
})
