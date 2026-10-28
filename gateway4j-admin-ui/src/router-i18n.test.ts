import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('router — permission denied i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'router/index.ts'), 'utf-8')

  it('uses i18n for permission denied message instead of hardcoded English', () => {
    expect(src).toMatch(/common\.permissionDenied/)
    expect(src).not.toMatch(/'Permission denied'/)
  })

  it('imports i18n from @/i18n', () => {
    expect(src).toMatch(/from ['"]@\/i18n['"]/)
  })
})

describe('i18n module exists', () => {
  it('src/i18n.ts exists', () => {
    expect(fs.existsSync(path.resolve(__dirname, 'i18n.ts'))).toBe(true)
  })

  it('main.ts imports i18n from ./i18n', () => {
    const main = fs.readFileSync(path.resolve(__dirname, 'main.ts'), 'utf-8')
    expect(main).toMatch(/from ['"]\.\/i18n['"]/)
    expect(main).not.toMatch(/createI18n/)
  })
})
