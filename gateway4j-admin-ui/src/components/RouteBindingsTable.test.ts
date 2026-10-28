import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import RouteBindingsTable, { type PluginBinding } from '@/components/RouteBindingsTable.vue'
import type { SelectOption } from '@/components/form/_types'

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
      common: { cancel: '取消' },
      route: {
        bindPlugin: '绑定插件', unbind: '解绑', bindDialogTitle: '绑定插件',
        bindPluginLabel: '插件', bindingConfig: '路由级配置',
        sortLabel: '排序', actionLabel: '操作'
      }
    }
  }
})

function factory(props: { modelValue: PluginBinding[]; pluginOptions: SelectOption[] }) {
  return mount(RouteBindingsTable, {
    props,
    global: { components: elementStubs, plugins: [i18n] }
  })
}

const BASE = (): PluginBinding => ({
  plugin_id: '',
  plugin_name: '',
  binding_config: '{}',
  sort_order: 0
})

function lastEmit<T>(wrapper: ReturnType<typeof mount>): T[] | undefined {
  const e = wrapper.emitted('update:modelValue')
  if (!e || e.length === 0) return undefined
  return e.at(-1)![0] as T[]
}

describe('RouteBindingsTable', () => {
  it('exposes initial bindings from modelValue', () => {
    const wrapper = factory({
      modelValue: [
        { ...BASE(), plugin_id: 'p1', plugin_name: 'plugin-1' }
      ],
      pluginOptions: []
    })
    const vm = wrapper.vm as any
    expect(vm.local.length).toBe(1)
    expect(vm.local[0].plugin_id).toBe('p1')
  })

  it('adds a new binding via addBinding with sort_order appended', async () => {
    const wrapper = factory({
      modelValue: [
        { ...BASE(), plugin_id: 'p1', plugin_name: 'plugin-1', sort_order: 0 }
      ],
      pluginOptions: [{ value: 'p2', label: 'plugin-2' }]
    })
    const vm = wrapper.vm as any
    vm.bindingForm = { plugin_id: 'p2', binding_config: '{"k":"v"}' }
    vm.addBinding()
    await wrapper.vm.$nextTick()
    expect(vm.dialogOpen).toBe(false)
    expect(vm.local.length).toBe(2)
    expect(vm.local[1].plugin_id).toBe('p2')
    expect(vm.local[1].plugin_name).toBe('plugin-2')
    expect(vm.local[1].binding_config).toBe('{"k":"v"}')
    expect(vm.local[1].sort_order).toBe(1)
  })

  it('does not add when plugin_id is empty', async () => {
    const wrapper = factory({
      modelValue: [],
      pluginOptions: [{ value: 'p1', label: 'plugin-1' }]
    })
    const vm = wrapper.vm as any
    vm.bindingForm = { plugin_id: '', binding_config: '{}' }
    vm.addBinding()
    await wrapper.vm.$nextTick()
    expect(vm.local.length).toBe(0)
  })

  it('resets bindingForm after a successful add', async () => {
    const wrapper = factory({
      modelValue: [],
      pluginOptions: [{ value: 'p1', label: 'plugin-1' }]
    })
    const vm = wrapper.vm as any
    vm.bindingForm = { plugin_id: 'p1', binding_config: '{"k":"v"}' }
    vm.addBinding()
    await wrapper.vm.$nextTick()
    expect(vm.bindingForm.plugin_id).toBe('')
    expect(vm.bindingForm.binding_config).toBe('{}')
  })

  it('removes a binding by index', async () => {
    const wrapper = factory({
      modelValue: [
        { ...BASE(), plugin_id: 'p1', plugin_name: 'p1' },
        { ...BASE(), plugin_id: 'p2', plugin_name: 'p2' }
      ],
      pluginOptions: []
    })
    const vm = wrapper.vm as any
    vm.removeBinding(0)
    await wrapper.vm.$nextTick()
    expect(vm.local.length).toBe(1)
    expect(vm.local[0].plugin_id).toBe('p2')
    const emitted = lastEmit<PluginBinding[]>(wrapper)
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
  })

  it('emits update:modelValue on add and remove', async () => {
    const wrapper = factory({
      modelValue: [],
      pluginOptions: [{ value: 'p1', label: 'plugin-1' }]
    })
    const vm = wrapper.vm as any
    vm.bindingForm = { plugin_id: 'p1', binding_config: '{}' }
    vm.addBinding()
    await wrapper.vm.$nextTick()
    vm.removeBinding(0)
    await wrapper.vm.$nextTick()
    const emitted = lastEmit<PluginBinding[]>(wrapper)
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(0)
  })

  it('renders the 绑定插件 toolbar button label', () => {
    const wrapper = factory({ modelValue: [], pluginOptions: [] })
    expect(wrapper.html()).toContain('绑定插件')
  })
})
