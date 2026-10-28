import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data'], template: '<div class="table-stub" />' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: {
    name: 'FcDialog',
    props: ['open', 'title', 'width'],
    template: '<div v-if="open" class="dialog-stub"><slot /><slot name="footer" /></div>'
  }
}))
vi.mock('@/components/form/FcButton.vue', () => ({
  default: { name: 'FcButton', props: ['variant', 'size', 'type'], template: '<button class="btn-stub"><slot /></button>' }
}))
vi.mock('@/components/form/FcSelect.vue', () => ({
  default: { name: 'FcSelect', props: ['modelValue', 'options'], template: '<select class="select-stub" />' }
}))

const elStubs = {
  'el-form': { template: '<form class="el-form-stub"><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item-stub"><slot /></div>' },
  'el-input': { template: '<textarea class="el-input-stub" />' },
  'el-table-column': { template: '<div class="col-stub" />' }
}

import RouteBindingsTable from '@/components/RouteBindingsTable.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: { bindPlugin: '绑定', bindPluginLabel: '插件', bindingConfig: '配置', sortLabel: '排序', actionLabel: '操作', unbind: '解绑', bindDialogTitle: '绑定插件' },
      common: { cancel: '取消' }
    }
  }
})

function factory(props: { modelValue: any[]; pluginOptions?: any[] }) {
  return mount(RouteBindingsTable, {
    global: { plugins: [i18n], stubs: elStubs },
    props: { pluginOptions: [], ...props }
  })
}

describe('RouteBindingsTable — bindings-changed emission', () => {
  it('emits bindings-changed when user adds a binding', async () => {
    const wrapper = factory({ modelValue: [], pluginOptions: [{ value: 'p1', label: 'Plugin1' }] })
    const vm = wrapper.vm as any
    vm.bindingForm.plugin_id = 'p1'
    vm.addBinding()
    await flushPromises()
    expect(wrapper.emitted('bindings-changed')?.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT emit bindings-changed when parent updates modelValue', async () => {
    const wrapper = factory({ modelValue: [], pluginOptions: [{ value: 'p1', label: 'Plugin1' }] })
    await flushPromises()
    // Clear any initial emissions
    wrapper.emitted('bindings-changed')?.splice(0)

    // Parent updates modelValue (e.g. from API load)
    await wrapper.setProps({
      modelValue: [{ plugin_id: 'p1', plugin_name: 'Plugin1', binding_config: '{}', sort_order: 0 }]
    })
    await flushPromises()

    // Should NOT emit bindings-changed for prop-driven updates
    expect(wrapper.emitted('bindings-changed')?.length ?? 0).toBe(0)
  })

  it('emits bindings-changed when user removes a binding', async () => {
    const wrapper = factory({
      modelValue: [{ plugin_id: 'p1', plugin_name: 'Plugin1', binding_config: '{}', sort_order: 0 }],
      pluginOptions: [{ value: 'p1', label: 'Plugin1' }]
    })
    await flushPromises()
    // Clear any initial emissions
    wrapper.emitted('bindings-changed')?.splice(0)

    const vm = wrapper.vm as any
    vm.removeBinding(0)
    await flushPromises()
    expect(wrapper.emitted('bindings-changed')?.length).toBeGreaterThanOrEqual(1)
  })
})
