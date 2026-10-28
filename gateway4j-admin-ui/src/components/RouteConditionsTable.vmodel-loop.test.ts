import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'RouteConditionsTable.vue'), 'utf-8')

describe('RouteConditionsTable — v-model loop prevention', () => {
  it('uses a guard flag to prevent emit-during-sync loop', () => {
    expect(source).toMatch(/syncingFromProp/)
    expect(source).toMatch(/if \(!syncingFromProp\)/)
  })
})
