import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteChainPreview — phase/scope i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteChainPreview.vue'), 'utf-8')

  it('does not use prop="phase" (raw enum display)', () => {
    // phase column should use a template with i18n, not prop="phase"
    expect(src).not.toMatch(/prop="phase"/)
  })

  it('does not use prop="scope" (raw enum display)', () => {
    // scope column should use a template with i18n, not prop="scope"
    expect(src).not.toMatch(/prop="scope"/)
  })

  it('uses phaseLabel function for i18n', () => {
    expect(src).toContain('phaseLabel')
  })

  it('uses scopeLabel function for i18n', () => {
    expect(src).toContain('scopeLabel')
  })
})
