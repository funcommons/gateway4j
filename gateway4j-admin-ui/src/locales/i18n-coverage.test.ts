import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from './zh-CN'
import enUS from './en-US'

// Walks a tree, returning all matching files
function walk(dir: string, ext: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p, ext))
    else if (ext.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

// Resolves a dotted key against an object, returning the leaf value (or undefined)
function resolveKey(obj: any, key: string): unknown {
  const parts = key.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p]
    else return undefined
  }
  return cur
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Whether a path is "business code" we own and must localize, vs SDK
// vendor code that ships its own copy of locales.
function isBusinessPath(p: string): boolean {
  // Top-level src/components/*.vue — our components
  // src/views/* — our pages
  // src/layouts/* — our layouts
  if (p.includes('/src/views/')) return true
  if (p.includes('/src/layouts/')) return true
  // /src/components/X.vue (top-level file, not in subdirectory)
  const compIdx = p.lastIndexOf('/src/components/')
  if (compIdx >= 0) {
    const after = p.slice(compIdx + '/src/components/'.length)
    if (!after.includes('/')) return true
  }
  return false
}

function collectUsedKeys(): string[] {
  const files = walk(ROOT, ['.vue', '.ts'])
  const keys = new Set<string>()
  const tRegex = /\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*)['"`]\s*\)/g
  for (const file of files) {
    if (file.includes('/locales/')) continue
    if (file.includes('i18n-coverage.test.ts')) continue
    if (!isBusinessPath(file)) continue
    const src = readFileSync(file, 'utf8')
    let m: RegExpExecArray | null
    while ((m = tRegex.exec(src)) !== null) {
      keys.add(m[1])
    }
  }
  return [...keys].sort()
}

function filterDotted(keys: string[]): string[] {
  return keys.filter((k) => k.includes('.'))
}

describe('i18n coverage', () => {
  const used = collectUsedKeys()
  const dotted = filterDotted(used)

  it('scans the source tree for t() calls', () => {
    expect(used.length).toBeGreaterThan(0)
    expect(dotted.length).toBeGreaterThan(0)
  })

  it('every dotted key used in src/ exists in zh-CN', () => {
    const missing = dotted.filter((k) => resolveKey(zhCN, k) === undefined)
    expect(missing, `Missing zh-CN keys: ${missing.join(', ')}`).toEqual([])
  })

  it('every dotted key used in src/ exists in en-US', () => {
    const missing = dotted.filter((k) => resolveKey(enUS, k) === undefined)
    expect(missing, `Missing en-US keys: ${missing.join(', ')}`).toEqual([])
  })

  it('both locales have the same set of dotted keys', () => {
    const zhKeys = dotted.filter((k) => resolveKey(zhCN, k) !== undefined)
    const enKeys = dotted.filter((k) => resolveKey(enUS, k) !== undefined)
    expect(enKeys).toEqual(zhKeys)
  })

  it('no key resolves to an empty string', () => {
    const empties = dotted.filter((k) => {
      const v = resolveKey(zhCN, k)
      return v === '' || v === null
    })
    expect(empties, `Empty zh-CN values: ${empties.join(', ')}`).toEqual([])
  })
})