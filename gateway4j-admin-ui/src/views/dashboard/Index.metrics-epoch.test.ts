import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('dashboard/Index.vue — loadMetrics has loadEpoch guard', () => {
  it('loadMetrics function checks loadEpoch after async calls', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../views/dashboard/Index.vue'),
      'utf-8'
    )
    // loadMetrics should have epoch guard after the API call
    const loadMetricsMatch = source.match(/async function loadMetrics\([^)]*\)[\s\S]*?^}/m)
    expect(loadMetricsMatch).toBeTruthy()
    const fn = loadMetricsMatch![0]
    // Should reference loadEpoch
    expect(fn).toContain('loadEpoch')
    // Should accept epoch parameter and check it after the async call
    expect(fn).toMatch(/epoch\s*!==\s*loadEpoch/)
  })
})
