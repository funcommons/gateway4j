import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ImportExport.vue — strategy i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'ImportExport.vue'), 'utf-8')

  it('strategies use t() for labels', () => {
    expect(src).toMatch(/importExport\.skip/)
    expect(src).toMatch(/importExport\.overwrite/)
    expect(src).toMatch(/importExport\.error/)
    expect(src).not.toMatch(/label: v\b/)
  })
})
