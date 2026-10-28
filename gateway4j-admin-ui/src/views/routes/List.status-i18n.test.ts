import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('routes/List.vue — status badge i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('status badge label is translated, not raw enum', () => {
    expect(src).not.toMatch(/:label="\(row as any\)\.status"/)
  })

  it('status badge references i18n keys for route statuses', () => {
    expect(src).toMatch(/route\.statusDraft|route\.statusPublished|route\.statusChanging|route\.statusOffline/)
  })
})
