import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Global.vue — plugin_type i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Global.vue'), 'utf-8')

  it('does not display raw plugin_type enum in FcTag', () => {
    expect(src).not.toMatch(/\{\{\s*p\.plugin_type\s*\}\}/)
  })

  it('uses i18n for plugin type labels via lookup map', () => {
    // Has a type-to-i18n-key mapping with plugin.type* keys
    expect(src).toContain('plugin.typeBuiltin')
    expect(src).toContain('plugin.typeJar')
    expect(src).toContain('plugin.typeGroovy')
    expect(src).toContain('plugin.typeGroup')
  })

  it('calls t() with mapped key in pluginTypeLabel', () => {
    expect(src).toMatch(/pluginTypeMap\[type\]/)
    expect(src).toMatch(/function pluginTypeLabel/)
  })
})
