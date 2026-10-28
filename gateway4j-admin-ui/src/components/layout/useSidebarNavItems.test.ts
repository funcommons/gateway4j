import { describe, it, expect, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, type Component } from 'vue'
import { useSidebarNavItems } from '@/components/layout/useSidebarNavItems'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      sidebar: {
        monitor: 'Monitor',
        routes: 'Routes',
        plugins: 'Plugins',
        users: 'Users',
        settings: 'Settings'
      }
    }
  }
})

const stubIcon: Component = defineComponent({ name: 'StubIcon', setup() { return () => h('i') } })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div />' }, meta: { title: 'sidebar.monitor' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' }, meta: { title: 'sidebar.routes' } },
      { path: '/plugins', name: 'Plugins', component: { template: '<div />' }, meta: { title: 'sidebar.plugins' } },
      { path: '/users', name: 'Users', component: { template: '<div />' }, meta: { title: 'sidebar.users' } },
      { path: '/settings', name: 'Settings', component: { template: '<div />' }, meta: { title: 'sidebar.settings' } }
    ]
  })
}

function factory() {
  const router = makeRouter()
  return defineComponent({
    setup() {
      const items = useSidebarNavItems({
        iconResolver: () => stubIcon,
        groups: [
          { id: 'main', labelKey: 'sidebar.routes', icon: stubIcon, routeNames: ['Routes'] },
          { id: 'sys', labelKey: 'sidebar.settings', icon: stubIcon, routeNames: ['Settings'] }
        ]
      })
      return { items, router }
    },
    template: '<div />'
  })
}

beforeEach(() => { })

describe('useSidebarNavItems', () => {
  it('returns a ComputedRef with array value', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = factory()
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    expect(Array.isArray(vm.items)).toBe(true)
  })

  it('produces a group per configured group rule', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = factory()
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    const groups = vm.items.filter((it: any) => it.type === 'group')
    expect(groups.length).toBe(2)
    expect(groups.map((g: any) => g.index).sort()).toEqual(['main', 'sys'])
  })

  it('group label is i18n-resolved', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = factory()
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    const main = vm.items.find((it: any) => it.index === 'main') as any
    expect(main.label).toBe('Routes')
  })

  it('group children have NavLeaf shape with index/label/icon/visible', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = factory()
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    const main = vm.items.find((it: any) => it.index === 'main') as any
    const leaf = main.children[0]
    expect(leaf).toHaveProperty('index')
    expect(leaf).toHaveProperty('label')
    expect(leaf).toHaveProperty('icon')
    expect(leaf).toHaveProperty('visible', true)
  })

  it('routeNamePrefix matches routes by name prefix', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = defineComponent({
      setup() {
        const items = useSidebarNavItems({
          iconResolver: () => stubIcon,
          groups: [
            { id: 'r', labelKey: 'sidebar.routes', icon: stubIcon, routeNamePrefix: 'R' }
          ]
        })
        return { items }
      },
      template: '<div />'
    })
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    // Routes prefixed with R: 'Routes' (matches)
    const r = vm.items.find((it: any) => it.index === 'r') as any
    expect(r.children.length).toBe(1)
    expect(r.children[0].index).toBe('/routes')
  })

  it('skips groups with no matching routes (visible is false)', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const Comp = defineComponent({
      setup() {
        const items = useSidebarNavItems({
          iconResolver: () => stubIcon,
          groups: [
            { id: 'empty', labelKey: 'sidebar.routes', icon: stubIcon, routeNames: ['NonExistent'] }
          ]
        })
        return { items }
      },
      template: '<div />'
    })
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    expect(vm.items.length).toBe(0)
  })

  it('features gate excludes routes whose meta.feature returns false', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/on', name: 'On', component: { template: '<div />' }, meta: { title: 'On', feature: 'beta' } },
        { path: '/off', name: 'Off', component: { template: '<div />' }, meta: { title: 'Off', feature: 'stable' } }
      ]
    })
    await router.push('/')
    await router.isReady()
    const Comp = defineComponent({
      setup() {
        const items = useSidebarNavItems({
          iconResolver: () => stubIcon,
          features: (k: string) => k === 'beta',
          groups: [
            { id: 'g', labelKey: 'sidebar.routes', icon: stubIcon, routeNames: ['On', 'Off'] }
          ]
        })
        return { items }
      },
      template: '<div />'
    })
    const wrapper = (await import('@vue/test-utils')).mount(Comp, {
      global: { plugins: [i18n, router] }
    })
    const vm = wrapper.vm as any
    const g = vm.items[0] as any
    // 'On' route has feature 'beta' which is enabled; 'Off' is 'stable' which is disabled
    // But also: requireTitle defaults to true — routes need meta.title
    // Both routes have title set, so they're picked up
    const childrenIndexes = g.children.map((c: any) => c.index)
    expect(childrenIndexes).toContain('/on')
    expect(childrenIndexes).not.toContain('/off')
  })
})