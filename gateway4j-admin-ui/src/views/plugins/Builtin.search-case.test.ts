import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(import.meta.dirname, 'Builtin.vue'),
  'utf-8'
)

describe('plugins/Builtin.vue — case-insensitive search', () => {
  it('uses toLowerCase() for keyword comparison', () => {
    const line = src.split('\n').find(l => l.includes('keyword') && l.includes('includes'))
    expect(line).toBeTruthy()
    expect(line!).toContain('toLowerCase')
  })
})
