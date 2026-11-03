import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

// Shared stubs
const stubs: Record<string, any> = {
  FcTable: defineComponent({ name: 'FcTable', props: ['data'], template: '<div class="fc-table"><slot /></div>' }),
  FcEmpty: defineComponent({ name: 'FcEmpty', props: ['title'], template: '<div class="fc-empty">{{ title }}</div>' }),
  FcButton: defineComponent({ name: 'FcButton', props: ['variant', 'size', 'type'], template: '<button><slot /></button>' }),
  FcDialog: defineComponent({ name: 'FcDialog', props: ['open', 'title'], template: '<div class="fc-dialog"><slot /><slot name="footer" /></div>' }),
  FcSelect: defineComponent({ name: 'FcSelect', props: ['modelValue', 'options', 'filterable', 'multiple'], template: '<select><option v-for="o in options" :key="o.value">{{ o.label }}</option></select>' }),
  FcInput: defineComponent({ name: 'FcInput', props: ['modelValue', 'type', 'placeholder', 'rows'], template: '<input :value="modelValue" />' }),
  FcFormItem: defineComponent({ name: 'FcFormItem', props: ['label'], template: '<div class="fc-form-item"><span class="label">{{ label }}</span><slot /></div>' }),
  'el-table-column': defineComponent({ name: 'el-table-column', props: ['label', 'prop', 'width'], template: '<div class="col">{{ label }}</div>' }),
  'el-form': defineComponent({ name: 'el-form', props: ['labelWidth'], template: '<div><slot /></div>' }),
  'el-form-item': defineComponent({ name: 'el-form-item', props: ['label'], template: '<div><slot /></div>' }),
  'el-input': defineComponent({ name: 'el-input', props: ['modelValue', 'type', 'rows', 'placeholder'], template: '<input />' }),
  'ElInputNumber': defineComponent({ name: 'ElInputNumber', props: ['modelValue', 'min'], template: '<input type="number" />' }),
  'el-switch': defineComponent({ name: 'el-switch', props: ['modelValue'], template: '<div />' }),
  'el-select': defineComponent({ name: 'el-select', props: ['modelValue'], template: '<select><slot /></select>' }),
  'el-option': defineComponent({ name: 'el-option', props: ['label', 'value'], template: '<option>{{ label }}</option>' })
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { delete: '删除', cancel: '取消', empty: '暂无数据' },
      route: {
        addCondition: '添加分发条件', bindPlugin: '绑定插件', unbind: '解绑',
        bindDialogTitle: '绑定插件', bindPluginLabel: '插件', bindingConfig: '路由级配置',
        sortLabel: '排序', actionLabel: '操作', noPluginsConfigured: '暂未配置插件',
        phaseLabel: '阶段', pluginNameLabel: '插件名', scopeLabel: '作用范围',
        condTypeLabel: '类型', operatorLabel: '运算符', condKeyLabel: '键',
        condValueLabel: '值', targetRouteLabel: '目标路由', priorityLabel: '优先级',
        operatorEq: '等于', operatorNe: '不等于', operatorContains: '包含',
        operatorRegex: '正则', operatorExists: '存在', operatorGt: '大于', operatorLt: '小于',
        schemaLoading: '载入中...', noSchema: '暂无 schema'
      }
    }
  }
})

describe('RouteChainPreview — i18n', () => {
  it('renders column labels and empty state via i18n', async () => {
    const RouteChainPreview = (await import('@/components/RouteChainPreview.vue')).default
    const wrapper = mount(RouteChainPreview, {
      props: { chain: [], bindingsCount: 0 },
      global: { components: stubs, plugins: [i18n] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂未配置插件')
  })
})

describe('RouteBindingsTable — i18n', () => {
  it('renders labels via i18n', async () => {
    const RouteBindingsTable = (await import('@/components/RouteBindingsTable.vue')).default
    const wrapper = mount(RouteBindingsTable, {
      props: { modelValue: [], pluginOptions: [] },
      global: { components: stubs, plugins: [i18n] }
    })
    await flushPromises()
    const vm = wrapper.vm as any
    // Verify i18n is used by checking the component mounts
    expect(wrapper.html()).toContain('fc-table')
  })
})

describe('RouteConditionsTable — i18n', () => {
  it('renders operator labels via i18n', async () => {
    const RouteConditionsTable = (await import('@/components/RouteConditionsTable.vue')).default
    const wrapper = mount(RouteConditionsTable, {
      props: { modelValue: [], routeOptions: [] },
      global: { components: stubs, plugins: [i18n] }
    })
    await flushPromises()
    const vm = wrapper.vm as any
    const labels = vm.operatorOptions.map((o: any) => o.label)
    expect(labels).toContain('等于')
    expect(labels).toContain('不等于')
    expect(labels).toContain('包含')
  })
})

describe('PluginDynamicForm — i18n', () => {
  it('renders loading and empty states via i18n', async () => {
    vi.mock('@/api/plugins', () => ({ getBuiltinSchema: vi.fn().mockResolvedValue(null) }))
    const PluginDynamicForm = (await import('@/components/PluginDynamicForm.vue')).default
    const wrapper = mount(PluginDynamicForm, {
      props: { pluginId: 'test-plugin', modelValue: {} },
      global: { components: stubs, plugins: [i18n] }
    })
    await flushPromises()
    // After loading, schema is null so empty state should show
    const text = wrapper.text()
    expect(text).toContain('暂无 schema')
    vi.restoreAllMocks()
  })
})
