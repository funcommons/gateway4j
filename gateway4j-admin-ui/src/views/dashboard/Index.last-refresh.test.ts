import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — last refresh timestamp', () => {
  it('displays last refresh time in metrics toolbar', () => {
    // Users need to know when data was last refreshed to assess freshness.
    const metricsToolbar = source.substring(
      source.indexOf('metrics-toolbar'),
      source.indexOf('metric-cards')
    )
    expect(metricsToolbar).toMatch(/lastRefresh/)
  })

  it('updates lastRefresh after loading metrics', () => {
    const loadMetricsFn = source.substring(
      source.indexOf('async function loadMetrics'),
      source.indexOf('function renderChart')
    )
    expect(loadMetricsFn).toMatch(/lastRefresh/)
  })
})
