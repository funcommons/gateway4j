import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — topology node status coloring', () => {
  it('maps HEALTHY status to green/success style', () => {
    // PRD: healthy nodes should be visually green
    const topoMap = source.substring(
      source.indexOf('topoNodes.value'),
      source.indexOf('topoEdges.value')
    )
    expect(topoMap).toMatch(/HEALTHY/)
    expect(topoMap).toMatch(/success|green|#4caf50|#52c41a|#67c23a/)
  })

  it('maps ERROR status to red/danger style', () => {
    // PRD: error nodes should be visually red
    const topoMap = source.substring(
      source.indexOf('topoNodes.value'),
      source.indexOf('topoEdges.value')
    )
    expect(topoMap).toMatch(/ERROR/)
    expect(topoMap).toMatch(/error|danger|red|#f56c6c|#ff4d4f/)
  })

  it('maps CIRCUIT_OPEN status to gray/neutral style', () => {
    // PRD: circuit_open nodes should be visually gray
    const topoMap = source.substring(
      source.indexOf('topoNodes.value'),
      source.indexOf('topoEdges.value')
    )
    expect(topoMap).toMatch(/CIRCUIT_OPEN/)
    expect(topoMap).toMatch(/neutral|gray|grey|#909399|#c0c4cc/)
  })
})
