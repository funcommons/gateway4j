import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isFeatureEnabled, features } from '@/config/features'

const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

function setSearch(query: string) {
  // jsdom's location.search doesn't auto-update; manually patch
  const url = new URL(window.location.href)
  url.search = query
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: url.search, href: url.href },
    configurable: true,
    writable: true
  })
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
  localStorageMock.clear()
  setSearch('')
  vi.unstubAllGlobals()
})

describe('isFeatureEnabled', () => {
  it('returns true by default (when no localStorage / URL config)', () => {
    expect(isFeatureEnabled('anyFeature')).toBe(true)
  })

  it('returns false when localStorage gw4j_features has explicit false', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ darkMode: false }))
    expect(isFeatureEnabled('darkMode')).toBe(false)
  })

  it('returns true when localStorage gw4j_features has explicit true', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ darkMode: true }))
    expect(isFeatureEnabled('darkMode')).toBe(true)
  })

  it('localStorage flag for one feature does not affect another', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ featureA: false }))
    expect(isFeatureEnabled('featureA')).toBe(false)
    expect(isFeatureEnabled('featureB')).toBe(true) // defaults to true
  })

  it('returns false when URL has ?feature=foo&value=false', () => {
    setSearch('?feature=darkMode&value=false')
    expect(isFeatureEnabled('darkMode')).toBe(false)
  })

  it('returns true when URL has ?feature=foo&value=true (overrides default)', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ darkMode: false }))
    setSearch('?feature=darkMode&value=true')
    expect(isFeatureEnabled('darkMode')).toBe(true)
  })

  it('localStorage flag wins when URL has no override for that feature', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ darkMode: false }))
    setSearch('?feature=otherFeature&value=true')
    expect(isFeatureEnabled('darkMode')).toBe(false)
  })

  it('ignores malformed localStorage JSON (falls back to default)', () => {
    localStorageMock.setItem('gw4j_features', '{not valid json')
    expect(isFeatureEnabled('anyFeature')).toBe(true)
  })
})

describe('features.all()', () => {
  it('returns the full flag map when localStorage is set', () => {
    localStorageMock.setItem('gw4j_features', JSON.stringify({ a: true, b: false }))
    const all = features.all()
    expect(all.a).toBe(true)
    expect(all.b).toBe(false)
  })

  it('returns empty object when localStorage unset', () => {
    expect(features.all()).toEqual({})
  })
})

describe('features.isFeatureEnabled', () => {
  it('is the same as the named export', () => {
    expect(features.isFeatureEnabled).toBe(isFeatureEnabled)
  })
})