import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — CIRCUIT_OPEN status badge', () => {
  it('maps CIRCUIT_OPEN to neutral tone in status table', () => {
    // PRD: CIRCUIT_OPEN should be visually gray (neutral), not pending (yellow).
    // The status table badge must handle CIRCUIT_OPEN explicitly.
    // Find the FcStatusBadge in the status tab template
    const statusTab = source.substring(
      source.indexOf('#tab-status'),
      source.indexOf('#tab-metrics')
    )
    expect(statusTab).toMatch(/CIRCUIT_OPEN/)
    expect(statusTab).toMatch(/neutral/)
  })
})
