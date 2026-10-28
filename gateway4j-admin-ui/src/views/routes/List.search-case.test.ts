import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(import.meta.dirname, 'List.vue'),
  'utf-8'
)

describe('routes/List.vue — case-insensitive search', () => {
  it('uses toLowerCase() for keyword comparison', () => {
    // The keyword filter should be case-insensitive.
    // Look for the pattern: .toLowerCase().includes(keyword.toLowerCase())
    // or equivalent case-insensitive comparison
    const hasCaseInsensitive = src.includes('toLowerCase()') && src.includes('includes')
    expect(hasCaseInsensitive).toBe(true)
  })

  it('the keyword filter line uses toLowerCase on both sides', () => {
    // Find the line that does keyword filtering
    const line = src.split('\n').find(l => l.includes('keyword') && l.includes('includes'))
    expect(line).toBeTruthy()
    expect(line!).toContain('toLowerCase')
  })
})
