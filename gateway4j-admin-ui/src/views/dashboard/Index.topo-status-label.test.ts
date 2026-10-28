import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — topology node status label', () => {
  it('includes status in topology node label', () => {
    // Topology nodes should display the route status in their label
    // so users can see the status at a glance, not just name and type.
    const topoMap = source.substring(
      source.indexOf('topoNodes.value'),
      source.indexOf('topoEdges.value')
    )
    // The label expression must reference n.status, not just n.name and n.type
    const labelMatch = topoMap.match(/label:\s*`([^`]+)`/)
    expect(labelMatch).toBeTruthy()
    expect(labelMatch![1]).toMatch(/n\.status/)
  })
})
