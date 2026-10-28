import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ImportExport.vue — route_type i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'ImportExport.vue'), 'utf-8')

  it('does not use bare prop="route_type"', () => {
    expect(src).not.toContain('prop="route_type"')
  })

  it('uses i18n for route type labels', () => {
    expect(src).toContain('route.typeBackend')
    expect(src).toContain('route.typeDispatch')
  })
})
