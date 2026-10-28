import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: defineComponent({
    name: 'FcEmpty',
    props: ['title', 'type', 'description'],
    template: '<div class="fc-empty"><span v-if="title">{{ title }}</span></div>'
  })
}))

import RouteChainPreview, { type ChainItem } from '@/components/RouteChainPreview.vue'

const elementStubs = {
  'el-table-column': defineComponent({
    name: 'el-table-column',
    props: ['label', 'prop', 'width'],
    template: '<col class="col" :data-label="label" :data-prop="prop" :data-width="width" />'
  })
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: {
        noPluginsConfigured: '暂未配置插件', phaseLabel: '阶段',
        pluginNameLabel: '插件名', scopeLabel: '作用范围', bindingConfig: '路由级配置'
      }
    }
  }
})

function factory(props: { chain: ChainItem[]; bindingsCount: number }) {
  return mount(RouteChainPreview, {
    props,
    global: { components: elementStubs, plugins: [i18n] }
  })
}

const BASE = (): ChainItem => ({
  phase: 'PRE',
  plugin_name: '',
  scope: 'ROUTE',
  binding_config: '{}'
})

describe('RouteChainPreview', () => {
  it('shows empty placeholder when bindingsCount is zero', () => {
    const wrapper = factory({ chain: [], bindingsCount: 0 })
    expect(wrapper.html()).toContain('暂未配置插件')
  })

  it('does not show empty placeholder when bindings exist even if chain is empty (still loading)', () => {
    const wrapper = factory({ chain: [], bindingsCount: 2 })
    expect(wrapper.html()).not.toContain('暂未配置插件')
  })

  it('shows empty placeholder when bindingsCount is zero even with chain populated (stale data safety)', () => {
    // only show chain when bindings are present — avoids misleading "no plugins" text
    // while chain has stale entries from a prior state
    const wrapper = factory({ chain: [BASE()], bindingsCount: 0 })
    expect(wrapper.html()).toContain('暂未配置插件')
  })

  it('exposes the chain array via local state', () => {
    const chain = [
      { ...BASE(), plugin_name: 'plugin-A', phase: 'PRE' },
      { ...BASE(), plugin_name: 'plugin-B', phase: 'POST' }
    ]
    const wrapper = factory({ chain, bindingsCount: 2 })
    const vm = wrapper.vm as any
    expect(vm.local.length).toBe(2)
    expect(vm.local[0].plugin_name).toBe('plugin-A')
    expect(vm.local[1].phase).toBe('POST')
  })

  it('updates local when chain prop changes', async () => {
    const wrapper = factory({ chain: [BASE()], bindingsCount: 1 })
    await wrapper.setProps({ chain: [{ ...BASE(), plugin_name: 'replaced' }] })
    const vm = wrapper.vm as any
    expect(vm.local.length).toBe(1)
    expect(vm.local[0].plugin_name).toBe('replaced')
  })

  it('preserves chain item shape (phase, scope, binding_config)', () => {
    const wrapper = factory({
      chain: [{ phase: 'POST', plugin_name: 'p1', scope: 'GLOBAL', binding_config: '{"k":"v"}' }],
      bindingsCount: 1
    })
    const vm = wrapper.vm as any
    const item = vm.local[0]
    expect(item.phase).toBe('POST')
    expect(item.scope).toBe('GLOBAL')
    expect(item.binding_config).toBe('{"k":"v"}')
  })
})
