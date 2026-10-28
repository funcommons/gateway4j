import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('Dashboard — chart init only on metrics tab', () => {
  it('skips renderChart when not on metrics tab', () => {
    // ECharts.init() on a hidden element produces a 0×0 chart that never
    // renders correctly. renderChart() should bail out when the metrics tab
    // is not active.
    const renderFn = source.substring(source.indexOf('function renderChart()'), source.indexOf('function setupAutoRefresh()'))
    expect(renderFn).toMatch(/tab\.value !== 'metrics'/)
  })
})
