import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Canvas — edge priority validation', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

  it('uses FcInputNumber for edge priority', () => {
    expect(src).toContain('FcInputNumber')
    expect(src).not.toMatch(/<el-input-number/)
  })

  it('edge priority has :min="1"', () => {
    expect(src).toContain(':min="1"')
  })

  it('edge priority has :max="999"', () => {
    expect(src).toContain(':max="999"')
  })

  it('does not use FcInput for edge priority', () => {
    expect(src).not.toContain('edge-priority" type="number"')
  })
})

describe('Canvas — property panel maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

  it('upstream_url input has maxlength', () => {
    expect(src).toContain('maxlength="500"')
  })

  it('path input has maxlength', () => {
    // Check that path has maxlength (not condition_value which also has maxlength)
    const lines = src.split('\n')
    const pathLine = lines.find(l => l.includes('prop-path') && l.includes('maxlength'))
    expect(pathLine).toBeTruthy()
  })
})
