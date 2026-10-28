import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Settings.vue — dict column i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

  it('dict value column uses i18n for label', () => {
    expect(src).toMatch(/dictValue/)
    expect(src).not.toMatch(/label="value"/)
  })

  it('dict label column uses i18n for label', () => {
    expect(src).toMatch(/dictLabel/)
    expect(src).not.toMatch(/label="label"/)
  })
})

describe('Settings i18n keys', () => {
  const en: any = fs.readFileSync(path.resolve(__dirname, '../locales/en-US.ts'), 'utf-8')
  const zh: any = fs.readFileSync(path.resolve(__dirname, '../locales/zh-CN.ts'), 'utf-8')

  it('en-US has settings.dictValue and settings.dictLabel', () => {
    expect(en).toMatch(/dictValue/)
    expect(en).toMatch(/dictLabel/)
  })

  it('zh-CN has settings.dictValue and settings.dictLabel', () => {
    expect(zh).toMatch(/dictValue/)
    expect(zh).toMatch(/dictLabel/)
  })
})
