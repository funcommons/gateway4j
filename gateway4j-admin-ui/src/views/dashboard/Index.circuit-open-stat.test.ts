import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — CIRCUIT_OPEN stat card', () => {
  it('includes CIRCUIT_OPEN count in stats', () => {
    // The dashboard stat cards should show how many routes are in CIRCUIT_OPEN
    // state, alongside the existing healthy count.
    const statsComputed = source.substring(
      source.indexOf('const stats = computed'),
      source.indexOf('const latestMetric')
    )
    expect(statsComputed).toMatch(/CIRCUIT_OPEN/)
  })
})
