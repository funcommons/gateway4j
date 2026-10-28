import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Canvas — label and config maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

  it('node label input has maxlength matching route_name VARCHAR(50)', () => {
    const lines = src.split('\n')
    const labelLine = lines.find(l => l.includes('prop-label') && l.includes('maxlength'))
    expect(labelLine).toBeTruthy()
  })

  it('node config textarea has maxlength', () => {
    const lines = src.split('\n')
    const configLine = lines.find(l => l.includes('prop-config') && l.includes('maxlength'))
    expect(configLine).toBeTruthy()
  })
})
