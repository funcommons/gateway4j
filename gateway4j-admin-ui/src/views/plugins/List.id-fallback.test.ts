import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('List.vue — instance_id fallback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('enablePlugin uses instance_id with id fallback', () => {
    const enableMatch = src.match(/enablePlugin\(([^)]+)\)/)
    expect(enableMatch).toBeTruthy()
    expect(enableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('disablePlugin uses instance_id with id fallback', () => {
    const disableMatch = src.match(/disablePlugin\(([^)]+)\)/)
    expect(disableMatch).toBeTruthy()
    expect(disableMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })

  it('deletePlugin uses instance_id with id fallback', () => {
    const deleteMatch = src.match(/deletePlugin\(([^)]+)\)/)
    expect(deleteMatch).toBeTruthy()
    expect(deleteMatch![1]).toMatch(/instance_id \|\| .*\.id/)
  })
})
