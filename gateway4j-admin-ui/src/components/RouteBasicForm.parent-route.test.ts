import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBasicForm — parent_route_id selector', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'RouteBasicForm.vue'), 'utf-8')

  it('RouteBasic type includes parent_route_id field', () => {
    expect(source).toMatch(/parent_route_id/)
  })

  it('template has a parent route selector element', () => {
    // Should have a form item for parent route selection
    const hasParentSelector = source.includes('parent_route_id') &&
      (source.includes('FcSelect') || source.includes('el-select'))
    expect(hasParentSelector, 'RouteBasicForm should have parent route selector').toBe(true)
  })

  it('component accepts routeOptions prop for parent selection', () => {
    expect(source).toMatch(/routeOptions/)
  })
})
