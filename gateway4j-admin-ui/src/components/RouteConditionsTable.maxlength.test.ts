import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteConditionsTable — condition key/value maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteConditionsTable.vue'), 'utf-8')

  it('condition_key input has maxlength', () => {
    // gw_route_condition.condition_key VARCHAR(200)
    expect(src).toContain('maxlength="200"')
  })

  it('condition_value input has maxlength', () => {
    // gw_route_condition.condition_value VARCHAR(500)
    expect(src).toContain('maxlength="500"')
  })
})
