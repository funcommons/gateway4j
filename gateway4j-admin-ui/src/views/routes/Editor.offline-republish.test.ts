import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('routes/Editor.vue — OFFLINE republish action', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('shows republish button for OFFLINE routes in editor footer', () => {
    // The publish button v-if should include routeStatus === 'OFFLINE'
    const lines = source.split('\n')
    const hasOfflinePublish = lines.some(line => {
      const hasOffline = /routeStatus\s*===\s*['"]OFFLINE['"]/.test(line)
      const hasPublish = /@click="publish"/.test(line)
      return hasOffline && hasPublish
    })
    expect(hasOfflinePublish, 'Editor.vue publish button should include OFFLINE status').toBe(true)
  })
})
