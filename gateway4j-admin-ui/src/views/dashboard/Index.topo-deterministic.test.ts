import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — topology deterministic layout', () => {
  it('does not use Math.random for node positions', () => {
    // Math.random() causes layout to jump on every reload, making the topology
    // view unstable. Node positions should be deterministic.
    const topoMap = source.substring(
      source.indexOf('topoNodes.value'),
      source.indexOf('topoEdges.value')
    )
    expect(topoMap).not.toMatch(/Math\.random/)
  })
})
