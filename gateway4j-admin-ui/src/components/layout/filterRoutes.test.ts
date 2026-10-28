import { describe, it, expect } from 'vitest'
import { filterRoutes } from '@/components/layout/useRouteAccess'
import type { RouteRecordNormalized } from 'vue-router'

function makeRoute(name: string, meta: Record<string, unknown> = {}): RouteRecordNormalized {
  return {
    name,
    path: '/' + name,
    meta
  } as unknown as RouteRecordNormalized
}

describe('filterRoutes — default behavior', () => {
  it('excludes routes without meta.title by default', () => {
    const routes = [makeRoute('A', { title: 'A title' }), makeRoute('B')]
    const result = filterRoutes(routes)
    expect(result.map((r) => r.name)).toEqual(['A'])
  })

  it('requireTitle=false allows routes without meta.title', () => {
    const routes = [makeRoute('A'), makeRoute('B', { title: 'B title' })]
    const result = filterRoutes(routes, { requireTitle: false })
    expect(result.map((r) => r.name).sort()).toEqual(['A', 'B'])
  })
})

describe('filterRoutes — features gate', () => {
  it('excludes routes whose meta.feature returns false', () => {
    const routes = [
      makeRoute('A', { title: 'A title', feature: 'beta' }),
      makeRoute('B', { title: 'B title' })
    ]
    const result = filterRoutes(routes, { features: (k) => k !== 'beta' })
    expect(result.map((r) => r.name)).toEqual(['B'])
  })

  it('does not filter routes without meta.feature (feature is opt-in)', () => {
    const routes = [makeRoute('A', { title: 'A title' })]
    const result = filterRoutes(routes, { features: () => false })
    expect(result.map((r) => r.name)).toEqual(['A'])
  })
})

describe('filterRoutes — customFilter', () => {
  it('excludes routes that fail the custom filter', () => {
    const routes = [makeRoute('A', { title: 'A' }), makeRoute('B', { title: 'B', hidden: true })]
    const result = filterRoutes(routes, { customFilter: (r) => !r.meta.hidden })
    expect(result.map((r) => r.name)).toEqual(['A'])
  })

  it('routes that pass customFilter are kept', () => {
    const routes = [makeRoute('A', { title: 'A' }), makeRoute('B', { title: 'B' })]
    const result = filterRoutes(routes, { customFilter: () => true })
    expect(result.map((r) => r.name).sort()).toEqual(['A', 'B'])
  })
})

describe('filterRoutes — combined filters', () => {
  it('all filters apply with AND semantics', () => {
    const routes = [
      makeRoute('A', { title: 'A title', feature: 'on', admin: true }),
      makeRoute('B', { title: 'B title', feature: 'on' }),
      makeRoute('C', { title: 'C title', feature: 'off' })
    ]
    const result = filterRoutes(routes, {
      features: (k) => k === 'on',
      customFilter: (r) => !r.meta.admin
    })
    // A: feature ok but admin=true → excluded
    // B: feature ok, not admin → kept
    // C: feature off → excluded
    expect(result.map((r) => r.name)).toEqual(['B'])
  })

  it('returns empty array for empty input', () => {
    expect(filterRoutes([])).toEqual([])
  })
})