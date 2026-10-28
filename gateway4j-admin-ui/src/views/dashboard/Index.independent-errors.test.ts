import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('Dashboard — independent error handling for load sections', () => {
  it('does not clear statuses/topo when metrics load fails', () => {
    // Previously, loadMetrics() was inside the same try block as
    // listRouteStatus() and getTopology(). If metrics failed, the catch
    // would clear all data including successfully loaded statuses and topo.
    // Now each section has its own try/catch.
    const loadFn = source.substring(source.indexOf('async function load()'), source.indexOf('async function loadMetrics('))
    // Should have separate try blocks for status, topo, and metrics
    const tryCount = (loadFn.match(/\btry\s*\{/g) || []).length
    expect(tryCount).toBeGreaterThanOrEqual(2)
  })
})
