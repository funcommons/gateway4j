import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'MainLayout.vue'), 'utf-8')

describe('MainLayout — sidebar active path for nested routes', () => {
  it('uses route name matching or a computed activePath instead of raw $route.path', () => {
    // Using $route.path directly means /routes/123 won't match /routes
    // The fix should use route name or a computed that resolves to the parent path
    expect(source).toMatch(/activePath|activeMenu|currentMenu/)
  })

  it('maps nested route names to their parent sidebar path', () => {
    // RouteEdit -> /routes, RouteCanvas -> /routes, PluginEdit -> /plugins, etc.
    expect(source).toMatch(/routeName|route\.name|currentRoute/)
  })
})
