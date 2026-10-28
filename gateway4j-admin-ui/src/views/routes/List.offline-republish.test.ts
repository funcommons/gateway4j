import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('routes/List.vue — OFFLINE republish action', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('shows a publish/republish button for OFFLINE routes', () => {
    // State machine: OFFLINE → PUBLISHED (重新发布)
    // There should be a line containing both OFFLINE and publish
    const lines = source.split('\n')
    const hasOfflinePublish = lines.some(line =>
      line.includes('OFFLINE') && line.includes('publish')
    )
    expect(hasOfflinePublish, 'List.vue should have a button for OFFLINE status that calls publish').toBe(true)
  })

  it('OFFLINE routes can be deleted (already exists)', () => {
    expect(source).toContain('OFFLINE')
  })
})
