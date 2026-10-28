import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

describe('plugins/Builtin.vue — openConfig preserves existing config', () => {
  it('openConfig loads existing config from plugin item', () => {
    // openConfig should not always set config = {}
    const fn = source.substring(source.indexOf('function openConfig'), source.indexOf('async function saveConfig'))
    expect(fn).toMatch(/config\.value\s*=\s*(?!{}\s*$)/)
    // It should reference the plugin's existing config
    expect(fn).toMatch(/plugin\.config|selected\.value\.config|item\.config/)
  })

  it('openConfig handles null/undefined config gracefully (falls back to {})', () => {
    const fn = source.substring(source.indexOf('function openConfig'), source.indexOf('async function saveConfig'))
    // Should handle case where plugin.config is null/undefined
    expect(fn).toMatch(/\|\|\s*{}/)
  })
})
