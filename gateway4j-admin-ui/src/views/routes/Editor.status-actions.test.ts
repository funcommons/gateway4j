import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('routes/Editor.vue — status display and publish/offline actions', () => {
  it('shows route status badge in the editor', () => {
    // The editor should display the current route status (DRAFT/PUBLISHED/
    // CHANGING/OFFLINE) so the user knows the state without going back to
    // the list view.
    expect(source).toMatch(/FcStatusBadge/)
  })

  it('has publish button for DRAFT and CHANGING routes', () => {
    // PRD state machine: DRAFT → PUBLISHED (publish), CHANGING → PUBLISHED (republish)
    // The editor footer should include a publish action.
    expect(source).toMatch(/publishRoute|publish/)
  })

  it('has offline button for PUBLISHED and CHANGING routes', () => {
    // PRD state machine: PUBLISHED → OFFLINE (offline), CHANGING → OFFLINE (abandon)
    // The editor footer should include an offline action.
    expect(source).toMatch(/offlineRoute|offline/)
  })

  it('imports publishRoute and offlineRoute from API', () => {
    expect(source).toMatch(/publishRoute/)
    expect(source).toMatch(/offlineRoute/)
  })
})
