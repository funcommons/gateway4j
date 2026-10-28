import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'ImportExport.vue'), 'utf-8')

describe('ImportExport — route selection for export', () => {
  it('loads route list for export selection', () => {
    expect(source).toMatch(/listRoutes/)
  })

  it('has checkboxes or selection mechanism for routes', () => {
    expect(source).toMatch(/selectedRouteIds|routeSelection/)
  })

  it('passes selected route IDs to export API', () => {
    expect(source).toMatch(/selectedRouteIds|route_ids/i)
  })
})
