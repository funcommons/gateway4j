import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Roles — resource_type i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Roles.vue'), 'utf-8')

  it('does not use prop="resource_type" (raw enum display)', () => {
    expect(src).not.toMatch(/prop="resource_type"/)
  })

  it('uses resourceTypeLabel function for i18n', () => {
    expect(src).toContain('resourceTypeLabel')
  })
})
