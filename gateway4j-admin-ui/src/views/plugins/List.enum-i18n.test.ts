import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('List.vue — enum i18n in table and tags', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('does not display raw plugin_type in FcTag', () => {
    expect(src).not.toMatch(/\{\{\s*row\.plugin_type\s*\}\}/)
    expect(src).not.toMatch(/\{\{\s*group\.type\s*\}\}/)
  })

  it('does not display raw plugin_phase via bare prop', () => {
    // Should use a template with i18n, not bare prop="plugin_phase"
    expect(src).not.toContain('prop="plugin_phase"')
  })

  it('does not display raw scope via bare prop', () => {
    expect(src).not.toContain('prop="scope"')
  })

  it('uses i18n for plugin type labels', () => {
    expect(src).toContain('plugin.typeBuiltin')
  })

  it('uses i18n for plugin phase labels', () => {
    expect(src).toContain('plugin.phasePre')
    expect(src).toContain('plugin.phasePost')
  })

  it('uses i18n for scope labels', () => {
    expect(src).toContain('plugin.scopeRoute')
    expect(src).toContain('plugin.scopeGlobal')
  })
})
