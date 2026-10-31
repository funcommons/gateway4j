import { describe, it, expect } from 'vitest'
import zhCN from './zh-CN'
import enUS from './en-US'

// These tests verify the structural integrity of locale files. If a key
// is added in zh-CN but not in en-US (or vice versa), the i18n-coverage
// test will catch it, but these structure tests document the expected shape.

describe('locale structure', () => {
  it('zh-CN has 14 top-level sections', () => {
    expect(Object.keys(zhCN).sort()).toEqual([
      'app', 'auth', 'common', 'emptyState', 'env', 'importExport', 'monitor', 'plugin', 'role', 'route', 'settings', 'sidebar', 'user', 'ux'
    ].sort())
  })

  it('en-US has the same top-level sections as zh-CN', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('every zh-CN nested key exists in en-US (flat)', () => {
    function flatten(obj: any, prefix = ''): string[] {
      if (typeof obj !== 'object' || obj === null) return prefix ? [prefix] : []
      const out: string[] = []
      for (const k of Object.keys(obj)) {
        const newPrefix = prefix ? `${prefix}.${k}` : k
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          out.push(...flatten(obj[k], newPrefix))
        } else {
          out.push(newPrefix)
        }
      }
      return out
    }
    const zhKeys = flatten(zhCN).sort()
    const enKeys = flatten(enUS).sort()
    const missing = zhKeys.filter((k) => !enKeys.includes(k))
    expect(missing, `Keys in zh-CN but not en-US: ${missing.join(', ')}`).toEqual([])
  })

  it('every en-US nested key exists in zh-CN (no orphans)', () => {
    function flatten(obj: any, prefix = ''): string[] {
      if (typeof obj !== 'object' || obj === null) return prefix ? [prefix] : []
      const out: string[] = []
      for (const k of Object.keys(obj)) {
        const newPrefix = prefix ? `${prefix}.${k}` : k
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          out.push(...flatten(obj[k], newPrefix))
        } else {
          out.push(newPrefix)
        }
      }
      return out
    }
    const zhKeys = flatten(zhCN).sort()
    const enKeys = flatten(enUS).sort()
    const extra = enKeys.filter((k) => !zhKeys.includes(k))
    expect(extra, `Keys in en-US but not zh-CN: ${extra.join(', ')}`).toEqual([])
  })

  it('leaf values are all non-empty strings (no missing translations)', () => {
    function leaves(obj: any): string[] {
      if (typeof obj === 'string') return [obj]
      if (typeof obj !== 'object' || obj === null) return []
      const out: string[] = []
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string') out.push(obj[k])
        else if (typeof obj[k] === 'object' && obj[k] !== null) out.push(...leaves(obj[k]))
      }
      return out
    }
    const enLeaves = leaves(enUS)
    const empties = enLeaves.filter((s) => !s || s.trim() === '')
    expect(empties, `Empty en-US translations: ${empties.join(', ')}`).toEqual([])
  })

  it('no en-US leaf value is a literal Chinese character', () => {
    // Detects accidental zh-CN→en-US copy-paste
    const han = /[一-鿿]/
    function leaves(obj: any): Array<{ key: string; value: string }> {
      if (typeof obj === 'string') return [{ key: '', value: obj }]
      if (typeof obj !== 'object' || obj === null) return []
      const out: Array<{ key: string; value: string }> = []
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string') out.push({ key: k, value: obj[k] })
        else if (typeof obj[k] === 'object' && obj[k] !== null) out.push(...leaves(obj[k]))
      }
      return out
    }
    const all = leaves(enUS)
    const chinese = all.filter((l) => han.test(l.value))
    expect(chinese, `Found Chinese chars in en-US: ${JSON.stringify(chinese)}`).toEqual([])
  })
})