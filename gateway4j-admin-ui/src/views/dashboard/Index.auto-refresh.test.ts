import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — auto-refresh optimization', () => {
  it('auto-refresh calls loadMetrics, not full load()', () => {
    // Auto-refresh should only refresh metrics data, not re-fetch the entire
    // topology and route status list every 5 seconds.
    const refreshFn = source.substring(
      source.indexOf('function setupAutoRefresh'),
      source.indexOf('function clearRefreshTimer')
    )
    expect(refreshFn).toMatch(/loadMetrics/)
    expect(refreshFn).not.toMatch(/\bload\(\)/)
  })
})
