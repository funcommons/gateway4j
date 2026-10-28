import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Canvas.vue — doAutoSave checks canEdit permission', () => {
  it('doAutoSave function checks canEdit before saving', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'Canvas.vue'),
      'utf-8'
    )
    // Extract doAutoSave function
    const start = source.indexOf('async function doAutoSave()')
    const end = source.indexOf('\n}', start)
    const fn = source.substring(start, end + 2)
    // Should contain canEdit check
    expect(fn).toContain('canEdit')
  })
})
