import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ImportExport — jsonText textarea maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'ImportExport.vue'), 'utf-8')

  it('import textarea has maxlength', () => {
    const lines = src.split('\n')
    const importLine = lines.find(l => l.includes('jsonText') && l.includes('textarea') && l.includes('maxlength'))
    expect(importLine).toBeTruthy()
  })
})
