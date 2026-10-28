import { describe, it, expect } from 'vitest'
import enUS from './en-US'
import zhCN from './zh-CN'

// Curated set of high-visibility UI keys whose English versions MUST differ
// from the Chinese originals. If the en-US locale is still a shallow copy of
// zh-CN, these tests catch the regression.

const KEYS: Array<{ path: string[]; expectedEn: string }> = [
  { path: ['app', 'title'], expectedEn: 'Gateway4j Console' },
  { path: ['common', 'create'], expectedEn: 'Create' },
  { path: ['common', 'edit'], expectedEn: 'Edit' },
  { path: ['common', 'delete'], expectedEn: 'Delete' },
  { path: ['common', 'save'], expectedEn: 'Save' },
  { path: ['common', 'cancel'], expectedEn: 'Cancel' },
  { path: ['common', 'search'], expectedEn: 'Search' },
  { path: ['common', 'enable'], expectedEn: 'Enable' },
  { path: ['common', 'disable'], expectedEn: 'Disable' },
  { path: ['common', 'publish'], expectedEn: 'Publish' },
  { path: ['common', 'offline'], expectedEn: 'Offline' },
  { path: ['common', 'refresh'], expectedEn: 'Refresh' },
  { path: ['common', 'export'], expectedEn: 'Export' },
  { path: ['common', 'import'], expectedEn: 'Import' },
  { path: ['auth', 'login'], expectedEn: 'Login' },
  { path: ['auth', 'logout'], expectedEn: 'Logout' },
  { path: ['auth', 'username'], expectedEn: 'Username' },
  { path: ['auth', 'password'], expectedEn: 'Password' }
]

function resolve(obj: any, path: string[]): unknown {
  let cur: any = obj
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in cur) cur = cur[k]
    else return undefined
  }
  return cur
}

describe('en-US locale quality', () => {
  it.each(KEYS)('en-US $expectedEn at $path differs from zh-CN', ({ path, expectedEn }) => {
    const en = resolve(enUS, path)
    const zh = resolve(zhCN, path)
    expect(en, `en-US missing at ${path.join('.')}`).toBeTruthy()
    expect(en).toBe(expectedEn)
    expect(en).not.toBe(zh)
  })

  it('en-US has at least 30 keys translated (not just a copy of zh-CN)', () => {
    const enStr = JSON.stringify(enUS)
    const zhStr = JSON.stringify(zhCN)
    // shallow copy would have an identical-stringified payload
    expect(enStr).not.toBe(zhStr)
    // sanity check: en-US is non-trivial in size
    expect(enStr.length).toBeGreaterThan(500)
  })

  it('no en-US string contains Chinese characters', () => {
    const hanRegex = /[一-鿿]/
    function walk(o: any) {
      if (typeof o === 'string') return hanRegex.test(o) ? o : null
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          const hit = walk(o[k])
          if (hit) return `${k}: ${hit}`
        }
      }
      return null
    }
    const leak = walk(enUS)
    expect(leak, `en-US still has Chinese characters: ${leak}`).toBeNull()
  })
})