import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('router/index.ts — no hardcoded Chinese strings', () => {
  it('uses i18n key instead of hardcoded Chinese for permission denied message', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'index.ts'),
      'utf-8'
    )
    // The permission guard should not contain raw Chinese characters
    // It should use an i18n key like t('common.permissionDenied')
    const hasHardcodedChinese = /['"][一-鿿]+['"]/.test(source)
    expect(hasHardcodedChinese, 'Found hardcoded Chinese string in router/index.ts — use i18n key instead').toBe(false)
  })
})
