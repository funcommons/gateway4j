import { describe, it, expect } from 'vitest'
import { buildNavItems } from '@/components/layout/buildNavItems'
import type { BuildNavOptions } from '@/components/layout/buildNavItems'
import type { NavItem, NavLeaf, NavGroup } from '@/components/layout/buildNavItems'
import type { RouteRecordNormalized } from 'vue-router'
import type { Component } from 'vue'

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

describe('buildNavItems — order (混合排序)', () => {
  const routes = [makeRoute('Dash'), makeRoute('Routes'), makeRoute('Plugins'), makeRoute('Settings')]

  /** 把 items 压成可比较的形状: 顶层叶子 -> '/X', 分组 -> 'g:<id>' */
  const shape = (items: any[]) =>
    items.map((it) => (it.type === 'group' ? `g:${it.index}` : it.index))

  it('未声明 order 时保持旧行为: 顶层叶子全在前, 分组全在后', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash', 'Settings'] }],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'] },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'] }
      ]
    })
    expect(shape(items)).toEqual(['/Dash', '/Settings', 'g:route', 'g:plugin'])
  })

  it('声明 order 后顶层叶子与分组按 order 升序混合排列', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: 10 },
        { routeNames: ['Settings'], order: 50 }
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 20 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 30 }
      ]
    })
    expect(shape(items)).toEqual(['/Dash', 'g:route', 'g:plugin', '/Settings'])
  })

  it('同 order 时保持声明顺序 (顶层叶子先于分组)', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], order: 10 }],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 10 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 10 }
      ]
    })
    expect(shape(items)).toEqual(['/Dash', 'g:route', 'g:plugin'])
  })

  it('未声明 order 的规则排最后 (声明了 order 才启用混合排序)', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], order: 10 }, { routeNames: ['Settings'] }],
      groups: [{ id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'] }]
    })
    expect(shape(items)).toEqual(['/Dash', '/Settings', 'g:route'])
  })
})
// ============================================================================
// order 能力测试补全 —— 边界 / 交互 / 向后兼容金样
// ============================================================================

/**
 * 旧版实现 (order 特性引入之前的 buildNavItems) —— 金样基准.
 * 行为: 顶层叶子全部在前, 分组全部在后; 完全不做排序.
 * 这里独立实现一遍 (不调用被测函数), 作为「不声明 order 时行为不变」的逐项基准.
 */
function legacyBuildNavItems(options: BuildNavOptions): NavItem[] {
  const { routes, t, iconResolver, groups = [], topLevels = [], leafFilter } = options
  const effectiveRoutes = leafFilter ? routes.filter(leafFilter) : routes

  const resolveVisible = (visible?: boolean | (() => boolean)): boolean => {
    if (typeof visible === 'function') return visible()
    return visible !== false
  }

  const leafFromRoute = (route: RouteRecordNormalized): NavLeaf | null => {
    const meta = (route.meta ?? {}) as { title?: string; icon?: string }
    if (!meta.title) return null
    return {
      index: route.path,
      label: t(meta.title),
      icon: (meta.icon ? iconResolver(meta.icon) : undefined) as Component | undefined,
      visible: true,
    }
  }

  const collectLeaves = (rule: {
    routeNamePrefix?: string
    routeNames?: string[]
    leafFilter?: (r: RouteRecordNormalized) => boolean
  }): NavLeaf[] => {
    let matched: RouteRecordNormalized[]
    if (rule.routeNames) {
      const byName = new Map(effectiveRoutes.map((r) => [String(r.name), r]))
      matched = rule.routeNames
        .map((n) => byName.get(n))
        .filter((r): r is RouteRecordNormalized => !!r)
    } else if (rule.routeNamePrefix) {
      matched = effectiveRoutes.filter(
        (r) => typeof r.name === 'string' && r.name.startsWith(rule.routeNamePrefix!),
      )
    } else {
      matched = []
    }
    if (rule.leafFilter) matched = matched.filter(rule.leafFilter)
    return matched.map(leafFromRoute).filter((l): l is NavLeaf => !!l)
  }

  const out: NavItem[] = []
  for (const rule of topLevels) {
    if (!resolveVisible(rule.visible)) continue
    for (const leaf of collectLeaves(rule)) out.push(leaf)
  }
  for (const rule of groups) {
    if (!resolveVisible(rule.visible)) continue
    const leaves = collectLeaves(rule)
    if (leaves.length === 0) continue
    const group: NavGroup = {
      type: 'group',
      index: rule.id,
      label: t(rule.labelKey),
      icon: rule.icon ?? (rule.iconName ? (iconResolver(rule.iconName) as Component) : undefined),
      popperClass: rule.popperClass ?? 'fc-sidebar-popper',
      visible: true,
      children: leaves,
    }
    out.push(group)
  }
  return out
}

describe('buildNavItems — order (边界与兼容)', () => {
  const routes = [
    makeRoute('Dash'),
    makeRoute('Routes'),
    makeRoute('Plugins'),
    makeRoute('Settings'),
    makeRoute('Users'),
  ]

  /** 把 items 压成可比较的形状: 顶层叶子 -> '/X', 分组 -> 'g:<id>' */
  const shape = (items: any[]) =>
    items.map((it) => (it.type === 'group' ? `g:${it.index}` : it.index))

  it('order: 0 是合法值 (0 不等于「未声明」), 且排在 order: 5 之前', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: 0 },
        { routeNames: ['Settings'], order: 5 },
      ],
      groups: [{ id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 5 }],
    })
    // 若 0 被当成「未声明」, Dash 会落到未声明规则之后 —— 断言可区分这两种实现
    expect(shape(items)).toEqual(['/Dash', '/Settings', 'g:route'])
  })

  it('order: 0 声明后即启用混合排序 (未声明 order 的规则排最后)', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], order: 0 }],
      groups: [{ id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'] }],
    })
    expect(shape(items)).toEqual(['/Dash', 'g:route'])
  })

  it('负数 order 合法, 且排在 order: 0 之前', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], order: -10 }],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 0 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 10 },
      ],
    })
    expect(shape(items)).toEqual(['/Dash', 'g:route', 'g:plugin'])
  })

  it('多个负数 order 之间按数值升序', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: -5 },
        { routeNames: ['Settings'], order: -20 },
      ],
      groups: [{ id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: -1 }],
    })
    expect(shape(items)).toEqual(['/Settings', '/Dash', 'g:route'])
  })

  it('顶层叶子与分组同 order 时: 顶层叶子先于分组, 同 order 内保持声明顺序', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: 10 },
        { routeNames: ['Settings'], order: 10 },
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 10 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 10 },
      ],
    })
    // 同 order -> 按声明顺序 (seq): 顶层叶子全部先于分组
    expect(shape(items)).toEqual(['/Dash', '/Settings', 'g:route', 'g:plugin'])
  })

  it('同 order 的单个顶层叶子规则内部保持 routeNames 声明顺序', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Settings', 'Dash'], order: 10 }],
      groups: [{ id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 10 }],
    })
    expect(shape(items)).toEqual(['/Settings', '/Dash', 'g:route'])
  })

  it('有 order 但叶子被过滤光的规则整体不出现 (组与顶层叶子都算)', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: 5 },
        { routeNames: ['Settings'], leafFilter: () => false, order: 1 },
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], leafFilter: () => false, order: 2 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 3 },
      ],
    })
    // 空叶子规则直接消失, 不占位, 也不影响其它规则的相对顺序
    // (被过滤光的 Settings order:1 / route order:2 消失; 剩下 plugin order:3 在 Dash order:5 之前)
    expect(shape(items)).toEqual(['g:plugin', '/Dash'])
  })

  it('visible: false 的规则即使声明 order 也不出现', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], visible: false, order: 1 }],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], visible: false, order: 2 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 3 },
      ],
    })
    expect(shape(items)).toEqual(['g:plugin'])
  })

  it('visible 返回 false 的函数式规则 + order 也不出现', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], visible: () => false, order: 1 }],
      groups: [{ id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 2 }],
    })
    expect(shape(items)).toEqual(['g:plugin'])
  })

  it('routeNamePrefix 匹配的规则支持 order', () => {
    const prefixed = [makeRoute('CreateA'), makeRoute('CreateB'), makeRoute('Other')]
    const items = buildNavItems({
      routes: prefixed,
      t,
      iconResolver,
      topLevels: [{ routeNamePrefix: 'Create', order: 30 }],
      groups: [{ id: 'g', labelKey: 'sidebar.g', routeNames: ['Other'], order: 10 }],
    })
    expect(shape(items)).toEqual(['g:g', '/CreateA', '/CreateB'])
  })

  it('routeNamePrefix + order + leafFilter 组合: 过滤后剩余叶子仍按 order 归位', () => {
    const prefixed = [makeRoute('CreateA'), makeRoute('CreateB'), makeRoute('Other')]
    const items = buildNavItems({
      routes: prefixed,
      t,
      iconResolver,
      topLevels: [
        { routeNamePrefix: 'Create', leafFilter: (r) => r.name !== 'CreateA', order: 30 },
      ],
      groups: [{ id: 'g', labelKey: 'sidebar.g', routeNames: ['Other'], order: 10 }],
    })
    expect(shape(items)).toEqual(['g:g', '/CreateB'])
  })

  it('分组的 iconName -> iconResolver 解析在 order 排序后依然正确', () => {
    const icons: Record<string, Component> = {
      Connection: { name: 'Connection' } as unknown as Component,
      Box: { name: 'Box' } as unknown as Component,
    }
    const resolver = (name: string) => icons[name]
    const items = buildNavItems({
      routes,
      t,
      iconResolver: resolver,
      groups: [
        { id: 'route', labelKey: 'sidebar.route', iconName: 'Connection', routeNames: ['Routes'], order: 20 },
        { id: 'plugin', labelKey: 'sidebar.plugin', iconName: 'Box', routeNames: ['Plugins'], order: 10 },
      ],
    })
    expect(shape(items)).toEqual(['g:plugin', 'g:route'])
    expect((items[0] as NavGroup).icon).toBe(icons.Box)
    expect((items[1] as NavGroup).icon).toBe(icons.Connection)
  })

  it('分组直接传 icon 组件时, order 排序后 icon 不受影响', () => {
    const custom = { name: 'Custom' } as unknown as Component
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [
        { id: 'route', labelKey: 'sidebar.route', icon: custom, routeNames: ['Routes'], order: 20 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 10 },
      ],
    })
    expect(shape(items)).toEqual(['g:plugin', 'g:route'])
    expect((items[1] as NavGroup).icon).toBe(custom)
  })

  it('order x leafFilter (规则级): 被过滤的叶子不出现, 组仍按 order 归位', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes', 'Plugins'], leafFilter: (r) => r.name !== 'Plugins', order: 10 },
        { id: 'user', labelKey: 'sidebar.user', routeNames: ['Users'], order: 20 },
      ],
    })
    expect(shape(items)).toEqual(['g:route', 'g:user'])
    expect((items[0] as NavGroup).children.map((c) => c.index)).toEqual(['/Routes'])
  })

  it('order x leafFilter (全局): 全局过滤掉的叶子同样不出现', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes', 'Plugins'], order: 10 },
        { id: 'user', labelKey: 'sidebar.user', routeNames: ['Users'], order: 20 },
      ],
      leafFilter: (r) => r.name !== 'Plugins',
    })
    expect(shape(items)).toEqual(['g:route', 'g:user'])
    expect((items[0] as NavGroup).children.map((c) => c.index)).toEqual(['/Routes'])
  })

  it('order x leafFilter (全局): 组内叶子被过滤光时整组消失', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 10 },
        { id: 'user', labelKey: 'sidebar.user', routeNames: ['Users'], order: 20 },
      ],
      leafFilter: (r) => r.name !== 'Routes',
    })
    expect(shape(items)).toEqual(['g:user'])
  })

  it('金样: 不声明 order 的规则, 结果与旧版实现逐项相等', () => {
    const goldenRoutes = [
      makeRoute('Dash', { icon: 'Histogram' }),
      makeRoute('Routes', { icon: 'Tickets' }),
      makeRoute('Plugins', { icon: 'Grid' }),
      makeRoute('Settings', { icon: 'Setting' }),
      makeRoute('CreateA'),
      makeRoute('CreateB'),
      makeRoute('Hidden'),
    ]
    const options: BuildNavOptions = {
      routes: goldenRoutes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'] },
        { routeNamePrefix: 'Create' },
        { routeNames: ['Settings'] },
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', iconName: 'Connection', routeNames: ['Routes'] },
        { id: 'plugin', labelKey: 'sidebar.plugin', iconName: 'Box', routeNames: ['Plugins', 'Hidden'] },
        { id: 'empty', labelKey: 'sidebar.empty', routeNames: ['Nothing'] },
      ],
    }
    const current = buildNavItems(options)
    const legacy = legacyBuildNavItems(options)
    // 逐项相等 (含 label / icon / popperClass / children 的完整结构)
    expect(current).toEqual(legacy)
    expect(current.length).toBe(legacy.length)
    expect(shape(current)).toEqual(['/Dash', '/CreateA', '/CreateB', '/Settings', 'g:route', 'g:plugin'])
  })

  it('金样: 不声明 order + 规则级 leafFilter / visible, 结果与旧版实现逐项相等', () => {
    const goldenRoutes = [
      makeRoute('Dash'),
      makeRoute('Routes'),
      makeRoute('Plugins'),
      makeRoute('Hidden'),
    ]
    const options: BuildNavOptions = {
      routes: goldenRoutes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash', 'Hidden'], leafFilter: (r) => r.name !== 'Hidden' },
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: undefined },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], visible: false },
        { id: 'gone', labelKey: 'sidebar.gone', routeNames: ['Hidden'] },
      ],
    }
    expect(buildNavItems(options)).toEqual(legacyBuildNavItems(options))
  })

  it('重复 order 值: 按声明顺序稳定排列 (顶层叶子先于分组)', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [
        { routeNames: ['Dash'], order: 7 },
        { routeNames: ['Settings'], order: 7 },
      ],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 7 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 7 },
        { id: 'user', labelKey: 'sidebar.user', routeNames: ['Users'], order: 7 },
      ],
    })
    expect(shape(items)).toEqual(['/Dash', '/Settings', 'g:route', 'g:plugin', 'g:user'])
  })

  it('重复 order 值出现在不同数量级时, 仍按 order 升序 + 声明顺序稳定排列', () => {
    const items = buildNavItems({
      routes,
      t,
      iconResolver,
      topLevels: [{ routeNames: ['Dash'], order: 20 }],
      groups: [
        { id: 'route', labelKey: 'sidebar.route', routeNames: ['Routes'], order: 20 },
        { id: 'plugin', labelKey: 'sidebar.plugin', routeNames: ['Plugins'], order: 20 },
        { id: 'user', labelKey: 'sidebar.user', routeNames: ['Users'], order: 30 },
      ],
    })
    expect(shape(items)).toEqual(['/Dash', 'g:route', 'g:plugin', 'g:user'])
  })
})
