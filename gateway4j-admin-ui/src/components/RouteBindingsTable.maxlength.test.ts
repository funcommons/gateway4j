import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBindingsTable — binding_config maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBindingsTable.vue'), 'utf-8')

  it('binding_config textarea has maxlength', () => {
    expect(src).toContain('maxlength="10000"')
  })
})
