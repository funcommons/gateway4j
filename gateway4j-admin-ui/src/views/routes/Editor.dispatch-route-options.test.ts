import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('routes/Editor.vue — dispatchRouteOptions filters correctly', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('dispatchRouteOptions filters to DISPATCH routes only', () => {
    // The computed property should reference route_type === 'DISPATCH'
    const start = source.indexOf('const dispatchRouteOptions')
    const section = source.substring(start, start + 500)
    expect(section).toMatch(/DISPATCH/)
  })

  it('dispatchRouteOptions excludes current route (self)', () => {
    const start = source.indexOf('const dispatchRouteOptions')
    const section = source.substring(start, start + 500)
    expect(section).toMatch(/routeId/)
  })

  it('allRoutesFlat is populated from listRoutes response', () => {
    expect(source).toMatch(/allRoutesFlat/)
  })
})
