import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Global.vue — instance_id fallback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Global.vue'), 'utf-8')

  it('togglePlugin uses instance_id with id fallback for disable', () => {
    const disableMatch = src.match(/disablePlugin\(([^)]+)\)/)
    expect(disableMatch).toBeTruthy()
    expect(disableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('togglePlugin uses instance_id with id fallback for enable', () => {
    const enableMatch = src.match(/enablePlugin\(([^)]+)\)/)
    expect(enableMatch).toBeTruthy()
    expect(enableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('saveSort uses instance_id with id fallback', () => {
    // items.map callback should use instance_id || id
    expect(src).toMatch(/items\.map.*instance_id \|\| .*\.id/)
  })
})
