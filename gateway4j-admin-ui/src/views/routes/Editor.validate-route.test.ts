import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('routes/Editor.vue — validateRoute before save for dispatch routes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('save function calls validateRoute for dispatch routes', () => {
    const saveStart = source.indexOf('async function save()')
    const saveEnd = source.indexOf('\n}', saveStart + 10)
    const fn = source.substring(saveStart, saveEnd + 2)
    expect(fn).toContain('validateRoute')
  })

  it('validateRoute is imported from routes API', () => {
    // Import may span multiple lines, so check both the import name and the source
    expect(source).toContain('validateRoute')
    expect(source).toMatch(/from ['"]@\/api\/routes['"]/)
  })
})
