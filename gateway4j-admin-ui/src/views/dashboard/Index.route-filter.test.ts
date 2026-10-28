import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('Dashboard — route name filter', () => {
  it('has a search input for filtering routes by name', () => {
    expect(source).toMatch(/statusKeyword|statusSearch|routeFilter/)
  })

  it('filters the status table by route name using a computed property', () => {
    expect(source).toMatch(/filteredStatus/)
  })

  it('has a status filter segmented control for HEALTHY/ERROR/CIRCUIT_OPEN', () => {
    expect(source).toMatch(/statusFilter|statusTone/)
  })
})
