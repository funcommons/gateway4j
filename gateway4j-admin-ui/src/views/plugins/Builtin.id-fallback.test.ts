import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Builtin.vue — instance_id fallback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

  it('saveConfig uses instance_id with id fallback', () => {
    expect(src).toMatch(/instance_id \|\| .*\.id/)
  })

  it('toggleStatus uses instance_id with id fallback for disable', () => {
    const disableMatch = src.match(/disablePlugin\(([^)]+)\)/)
    expect(disableMatch).toBeTruthy()
    expect(disableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('toggleStatus uses instance_id with id fallback for enable', () => {
    const enableMatch = src.match(/enablePlugin\(([^)]+)\)/)
    expect(enableMatch).toBeTruthy()
    expect(enableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('guard checks both instance_id and id', () => {
    expect(src).toMatch(/instance_id.*id/)
  })
})
