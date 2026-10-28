import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Builtin.vue — plugin_phase i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

  it('does not display raw plugin_phase enum in FcTag', () => {
    expect(src).not.toMatch(/\{\{\s*item\.plugin_phase\s*\}\}/)
  })

  it('uses i18n for plugin phase labels', () => {
    expect(src).toContain('plugin.phasePre')
    expect(src).toContain('plugin.phasePost')
  })
})
