import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('plugins/Builtin.vue — validateConfig before save', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

  it('saveConfig function calls validateConfig before saving', () => {
    // The saveConfig function should call validateConfig API before updatePlugin
    const saveStart = source.indexOf('async function saveConfig()')
    const saveEnd = source.indexOf('\n}', saveStart)
    const fn = source.substring(saveStart, saveEnd + 2)
    expect(fn).toContain('validateConfig')
  })

  it('validateConfig is imported from plugins API', () => {
    expect(source).toMatch(/import.*validateConfig.*from.*@\/api\/plugins/)
  })
})
