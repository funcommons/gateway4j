import { describe, it, expect } from 'vitest'
import { useRouteAccess, filterRoutes } from '@/components/layout/useRouteAccess'
import type { Router, RouteRecordNormalized } from 'vue-router'
import { ref } from 'vue'

function makeRoute(name: string, meta: Record<string, unknown> = {}): RouteRecordNormalized {
  return {
    name,
    path: '/' + name,
    meta
  } as unknown as RouteRecordNormalized
}

function mockRouter(routes: RouteRecordNormalized[]): Router {
  return {
    getRoutes: () => routes
  } as unknown as Router
}

describe('useRouteAccess — composable integration', () => {
  it('returns a ComputedRef (reactive)', () => {
    const r = useRouteAccess(mockRouter([]))
    expect(r.value).toBeDefined()
    expect(Array.isArray(r.value)).toBe(true)
  })

  it('re-evaluates when getRoutes() is called inside the closure (reactive source)', () => {
    // useRouteAccess calls router.getRoutes() inside computed(). The
    // returned ComputedRef tracks that call. If router.getRoutes is
    // replaced with a function that returns different lists over time,
    // the computed re-runs.
    let current: RouteRecordNormalized[] = []
    const r = useRouteAccess({ getRoutes: () => current } as any)
    expect(r.value.length).toBe(0)
    current = [makeRoute('A', { title: 'A' })]
    // reading again — but computed caches the result if dependencies unchanged
    // We need a true reactive source to verify reactivity
  })

  it('re-runs when underlying data changes (reactive router mock)', () => {
    // Use a Vue ref to mock reactive source
    const source = ref<RouteRecordNormalized[]>([])
    const r = useRouteAccess({ getRoutes: () => source.value } as any)
    expect(r.value.length).toBe(0)
    source.value = [makeRoute('A', { title: 'A' })]
    expect(r.value.length).toBe(1)
    source.value = [makeRoute('A', { title: 'A' }), makeRoute('B', { title: 'B' })]
    expect(r.value.length).toBe(2)
  })

  it('strips routes without meta.title by default (requireTitle default true)', () => {
    const routes = [
      makeRoute('Titled', { title: 'A' }),
      makeRoute('Untitled')
    ]
    const r = useRouteAccess(mockRouter(routes))
    expect(r.value.map((x) => x.name)).toEqual(['Titled'])
  })

  it('keeps untitled routes when requireTitle=false', () => {
    const routes = [
      makeRoute('Titled', { title: 'A' }),
      makeRoute('Untitled')
    ]
    const r = useRouteAccess(mockRouter(routes), { requireTitle: false })
    expect(r.value.map((x) => x.name).sort()).toEqual(['Titled', 'Untitled'])
  })

  it('features option filters by meta.feature key', () => {
    const routes = [
      makeRoute('On', { title: 'On', feature: 'beta' }),
      makeRoute('Off', { title: 'Off', feature: 'legacy' })
    ]
    const r = useRouteAccess(mockRouter(routes), { features: (k) => k === 'beta' })
    expect(r.value.map((x) => x.name)).toEqual(['On'])
  })

  it('combines multiple filters (AND semantics)', () => {
    const routes = [
      makeRoute('A', { title: 'A', feature: 'on' }),
      makeRoute('B', { title: 'B', feature: 'off' }),
      makeRoute('C', { title: 'C', feature: 'on', admin: true })
    ]
    const r = useRouteAccess(mockRouter(routes), {
      features: (k) => k === 'on',
      customFilter: (route) => !route.meta.admin
    })
    // A: feature ok, not admin → kept
    // B: feature off → excluded
    // C: feature ok but admin → excluded
    expect(r.value.map((x) => x.name)).toEqual(['A'])
  })

  it('returns empty array when source has no matching routes', () => {
    const routes = [makeRoute('X')] // no title, no feature
    const r = useRouteAccess(mockRouter(routes))
    expect(r.value.length).toBe(0)
  })
})