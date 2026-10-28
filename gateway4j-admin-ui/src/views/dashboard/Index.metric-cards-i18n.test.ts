import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Dashboard — metric cards i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

  it('uses t() for QPS label in metric cards', () => {
    expect(src).toContain("label: t('monitor.qps')")
  })

  it('uses t() for P50 label in metric cards', () => {
    expect(src).toContain("label: t('monitor.p50')")
  })

  it('uses t() for P95 label in metric cards', () => {
    expect(src).toContain("label: t('monitor.p95')")
  })

  it('uses t() for P99 label in metric cards', () => {
    expect(src).toContain("label: t('monitor.p99')")
  })

  it('does not use hardcoded QPS string', () => {
    expect(src).not.toContain("{ label: 'QPS'")
  })
})

describe('Dashboard — chart legend/series i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

  it('uses t() for P50 in chart series name', () => {
    expect(src).toContain("name: t('monitor.p50')")
  })

  it('uses t() for P95 in chart series name', () => {
    expect(src).toContain("name: t('monitor.p95')")
  })

  it('uses t() for P99 in chart series name', () => {
    expect(src).toContain("name: t('monitor.p99')")
  })

  it('does not use hardcoded P50/P95/P99 in series', () => {
    expect(src).not.toContain("{ name: 'P50'")
    expect(src).not.toContain("{ name: 'P95'")
    expect(src).not.toContain("{ name: 'P99'")
  })
})
