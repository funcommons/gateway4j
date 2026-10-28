import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Plugin Editor — config textarea maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('config textarea has maxlength', () => {
    const lines = src.split('\n')
    const configLine = lines.find(l => l.includes('form.config') && l.includes('textarea') && l.includes('maxlength'))
    expect(configLine).toBeTruthy()
  })
})
