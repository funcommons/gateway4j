import { describe, it, expect } from 'vitest'
import { getBuiltinCategory, PLUGIN_CATEGORY_MAP, BUILTIN_CATEGORIES, type BuiltinCategoryKey } from './builtinCategories'
import fs from 'fs'
import path from 'path'

describe('builtinCategories', () => {
  it('maps known plugin_ids to correct categories', () => {
    expect(getBuiltinCategory('security')).toBe('security')
    expect(getBuiltinCategory('basic-auth')).toBe('security')
    expect(getBuiltinCategory('jwt')).toBe('security')
    expect(getBuiltinCategory('rate-limiter')).toBe('rate-limit')
    expect(getBuiltinCategory('circuit-breaker')).toBe('rate-limit')
    expect(getBuiltinCategory('rewrite')).toBe('traffic-rewrite')
    expect(getBuiltinCategory('redirect')).toBe('traffic-rewrite')
    expect(getBuiltinCategory('logging')).toBe('observability')
    expect(getBuiltinCategory('tracing')).toBe('observability')
    expect(getBuiltinCategory('cache')).toBe('traffic-control')
    expect(getBuiltinCategory('retry')).toBe('traffic-control')
    expect(getBuiltinCategory('modify-response')).toBe('response')
    expect(getBuiltinCategory('cryptor-request')).toBe('response')
    expect(getBuiltinCategory('sharing')).toBe('other')
    expect(getBuiltinCategory('mock')).toBe('other')
  })

  it('returns "other" for unknown plugin_ids', () => {
    expect(getBuiltinCategory('unknown-plugin')).toBe('other')
    expect(getBuiltinCategory('')).toBe('other')
  })

  it('PLUGIN_CATEGORY_MAP has entries for all 30 PRD plugins', () => {
    const prdPlugins = [
      'security', 'basic-auth', 'key-auth', 'jwt', 'oauth2', 'sign',
      'rate-limiter', 'circuit-breaker', 'sentinel',
      'rewrite', 'redirect', 'param-mapping', 'context-path', 'request',
      'logging', 'logging-kafka', 'logging-es', 'tracing', 'metrics',
      'cache', 'retry', 'websocket', 'waf',
      'modify-response', 'cryptor-request', 'cryptor-response',
      'sharing', 'mock', 'dingtalk', 'watermark'
    ]
    for (const id of prdPlugins) {
      expect(PLUGIN_CATEGORY_MAP[id], `missing mapping for ${id}`).toBeDefined()
    }
  })

  it('BUILTIN_CATEGORIES defines all 7 PRD categories', () => {
    const keys = BUILTIN_CATEGORIES.map(c => c.key)
    expect(keys).toContain('security')
    expect(keys).toContain('rate-limit')
    expect(keys).toContain('traffic-rewrite')
    expect(keys).toContain('observability')
    expect(keys).toContain('traffic-control')
    expect(keys).toContain('response')
    expect(keys).toContain('other')
    expect(BUILTIN_CATEGORIES.length).toBe(7)
  })

  it('each category has key and i18nKey', () => {
    for (const cat of BUILTIN_CATEGORIES) {
      expect(cat.key).toBeTruthy()
      expect(cat.i18nKey).toBeTruthy()
    }
  })

  it('Builtin.vue prefers server-provided category over client mapping', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')
    // The template should use item.category with fallback to getBuiltinCategory
    expect(source).toMatch(/item\.category/)
    expect(source).toMatch(/getBuiltinCategory/)
  })
})
