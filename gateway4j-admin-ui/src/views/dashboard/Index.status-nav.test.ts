import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

describe('dashboard/Index.vue — status row navigation', () => {
  it('status table has row-click handler that navigates to route editor', () => {
    // Clicking a row in the status table should navigate to the route editor
    // so users can quickly jump from monitoring to configuration.
    const statusTab = source.substring(
      source.indexOf('#tab-status'),
      source.indexOf('#tab-metrics')
    )
    expect(statusTab).toMatch(/@row-click|row-click/)
  })

  it('imports useRouter for navigation', () => {
    expect(source).toMatch(/useRouter/)
  })
})
