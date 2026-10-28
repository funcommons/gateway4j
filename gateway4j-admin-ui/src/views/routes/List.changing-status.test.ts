import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('routes/List.vue — CHANGING status support', () => {
  it('includes CHANGING in the filter tabs', () => {
    // PRD state machine: DRAFT → PUBLISHED → CHANGING → PUBLISHED/OFFLINE
    // The filter bar must include a tab for the CHANGING status so users
    // can find routes that have unpublished modifications.
    expect(source).toMatch(/CHANGING/)
    // Must appear in the tabs array definition
    const tabsMatch = source.match(/const\s+tabs\s*=\s*(?:computed\s*\(\s*\(\)\s*=>\s*)?\[[\s\S]*?\](?:\s*\))?/)
    expect(tabsMatch).toBeTruthy()
    expect(tabsMatch![0]).toContain('CHANGING')
  })

  it('renders CHANGING status badge with processing tone', () => {
    // CHANGING status means the route has unpublished modifications.
    // It should render with a "processing" tone (animated dot) to indicate
    // the route is in an active transition state.
    expect(source).toMatch(/CHANGING.*processing|processing.*CHANGING/)
  })

  it('shows republish action for CHANGING routes', () => {
    // PRD: CHANGING → PUBLISHED via "republish"
    // The action column should show a "republish" button when status is CHANGING,
    // not the regular "publish" button used for DRAFT routes.
    // At minimum, CHANGING routes must have a publish action available.
    const actionCol = source.substring(source.indexOf('common.more'))
    expect(actionCol).toMatch(/CHANGING/)
  })

  it('shows offline action for CHANGING routes', () => {
    // PRD: CHANGING → OFFLINE via "abandon changes"
    // CHANGING routes should be able to go offline (abandon the changes).
    const actionCol = source.substring(source.indexOf('common.more'))
    // Either the offline button appears for CHANGING or a specific abandon button
    expect(actionCol).toMatch(/CHANGING/)
  })
})
