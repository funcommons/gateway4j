import { describe, it, expect } from 'vitest'
import { buildNavItems } from '@/components/layout/buildNavItems'
import type { RouteRecordNormalized } from 'vue-router'

function makeRoute(name: string, meta: Record<string, unknown> = {}): RouteRecordNormalized {
  return {
    name,
    path: '/' + name,
    meta: { title: name + ' title', ...meta }
  } as unknown as RouteRecordNormalized
}

const fakeIcon = {} as any
const t = (k: string) => k
const iconResolver = () => fakeIcon

describe('buildNavItems — global leafFilter', () => {
  it('applies options.leafFilter to top-level leaves', () => {
    const routes = [makeRoute('A'), makeRoute('B'), makeRoute('C')]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['A', 'B', 'C'] }],
      leafFilter: (r) => r.name !== 'B'
    })
    const names = items.flatMap((it: any) => it.type === 'group' ? it.children.map((c: any) => c.index) : [it.index])
    expect(names).toEqual(['/A', '/C'])
  })

  it('applies options.leafFilter to group children', () => {
    const routes = [makeRoute('A'), makeRoute('B'), makeRoute('C')]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [{ id: 'g', labelKey: 'G', routeNames: ['A', 'B', 'C'] }],
      leafFilter: (r) => r.name !== 'C'
    })
    expect(items.length).toBe(1)
    const group = items[0] as any
    expect(group.type).toBe('group')
    expect(group.children.map((c: any) => c.index)).toEqual(['/A', '/B'])
  })

  it('applies options.leafFilter to BOTH topLevels and groups', () => {
    const routes = [makeRoute('A'), makeRoute('B'), makeRoute('C'), makeRoute('D')]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['A', 'B'] }],
      groups: [{ id: 'g', labelKey: 'G', routeNames: ['C', 'D'] }],
      leafFilter: (r) => r.name !== 'A' && r.name !== 'D'
    })
    const allIndexes = items.flatMap((it: any) =>
      it.type === 'group' ? it.children.map((c: any) => c.index) : [it.index]
    )
    expect(allIndexes).toEqual(['/B', '/C'])
  })

  it('rule.leafFilter is applied IN ADDITION to global leafFilter', () => {
    // Routes: A,B are admin-only, C is public, D is the new test case
    const routes = [
      makeRoute('A', { admin: true }),
      makeRoute('B', { admin: true }),
      makeRoute('C'),
      makeRoute('D', { admin: true })
    ]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [{ id: 'g', labelKey: 'G', routeNames: ['A', 'B', 'C', 'D'], leafFilter: (r) => !r.meta.admin }],
      leafFilter: (r) => r.name !== 'D'
    })
    // Both filters apply: A,B,D excluded by rule.leafFilter (admin=true)
    // D additionally excluded by global leafFilter (but already excluded)
    // C remains
    expect(items.length).toBe(1)
    const group = items[0] as any
    expect(group.type).toBe('group')
    expect(group.children.map((c: any) => c.index)).toEqual(['/C'])
  })
})

describe('buildNavItems — basic shape', () => {
  it('returns top-level items from topLevels rules', () => {
    const routes = [makeRoute('A'), makeRoute('B')]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['A', 'B'] }]
    })
    expect(items.length).toBe(2)
    expect((items[0] as any).type).toBeUndefined()
    expect((items[0] as any).index).toBe('/A')
  })

  it('returns a group when group rule has leaves', () => {
    const routes = [makeRoute('A'), makeRoute('B')]
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [{ id: 'g', labelKey: 'sidebar.g', routeNames: ['A', 'B'] }]
    })
    expect(items.length).toBe(1)
    expect((items[0] as any).type).toBe('group')
    expect((items[0] as any).label).toBe('sidebar.g')
  })
})