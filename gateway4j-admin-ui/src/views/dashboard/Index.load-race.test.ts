import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('Dashboard — load race condition', () => {
  it('uses an epoch counter to guard against stale loads', () => {
    // Without epoch, a slow first load() can overwrite data from a faster
    // second load(), showing stale data to the user.
    expect(source).toMatch(/loadEpoch/)
    expect(source).toMatch(/myEpoch/)
    expect(source).toMatch(/myEpoch !== loadEpoch/)
  })

  it('checks epoch after each async boundary in load()', () => {
    // After listRouteStatus(), getTopology(), and loadMetrics() — each await
    // is a yield point where a newer load() could have started.
    const loadFn = source.substring(source.indexOf('async function load()'), source.indexOf('async function loadMetrics('))
    const epochChecks = (loadFn.match(/myEpoch !== loadEpoch/g) || []).length
    expect(epochChecks).toBeGreaterThanOrEqual(3)
  })
})
