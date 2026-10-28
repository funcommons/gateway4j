import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Settings — numeric inputs use el-input-number', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

  it('token_expiry_hours uses el-input-number with :min and :max', () => {
    const lines = src.split('\n')
    const line = lines.find(l => l.includes('token_expiry_hours') && l.includes('el-input-number'))
    expect(line).toBeTruthy()
    expect(line).toContain(':min="1"')
    expect(line).toContain(':max="8760"')
  })

  it('refresh_expiry_days uses el-input-number with :min and :max', () => {
    const lines = src.split('\n')
    const line = lines.find(l => l.includes('refresh_expiry_days') && l.includes('el-input-number'))
    expect(line).toBeTruthy()
    expect(line).toContain(':min="1"')
    expect(line).toContain(':max="365"')
  })

  it('does not use FcInput type="number" for token_expiry_hours', () => {
    expect(src).not.toContain('token_expiry_hours" type="number"')
  })

  it('does not use FcInput type="number" for refresh_expiry_days', () => {
    expect(src).not.toContain('refresh_expiry_days" type="number"')
  })
})
