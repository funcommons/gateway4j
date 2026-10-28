import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/PluginDynamicForm.vue', () => ({
  default: {
    name: 'PluginDynamicForm',
    props: ['pluginId', 'modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="pdf-stub" />'
  }
}))
vi.mock('@/components/form/FcButton.vue', () => ({
  default: { name: 'FcButton', props: ['variant', 'size', 'loading', 'type'], template: '<button class="fc-button-stub"><slot /></button>' }
}))
vi.mock('@/components/layout/FcSection.vue', () => ({
  default: { name: 'FcSection', template: '<div class="section-stub"><slot /></div>' }
}))
vi.mock('@/components/layout/FcSectionCard.vue', () => ({
  default: { name: 'FcSectionCard', props: ['class'], template: '<div class="section-card-stub"><slot /></div>' }
}))
vi.mock('@/components/form/FcInput.vue', () => ({
  default: { name: 'FcInput', props: ['modelValue', 'placeholder', 'clearable'], template: '<input class="input-stub" />' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: { name: 'FcDialog', props: ['open', 'title', 'width'], template: '<div class="dialog-stub" v-if="open"><slot /><slot name="footer" /></div>' }
}))

import Builtin from '@/views/plugins/Builtin.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', enable: '启用', disable: '禁用', empty: '暂无数据', search: '搜索' },
      plugin: { configForm: '插件配置', builtinList: '内置插件' }
    }
  }
})

function makeType(over: Partial<any> = {}) {
  return {
    plugin_id: 'rate-limit', plugin_name: '限流', plugin_phase: 'PRE',
    description: '限流插件', config_schema: {}, instance_id: 'p1', status: 'ENABLED', ...over
  }
}

function factory() {
  return mount(Builtin, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

describe('Builtin.vue — i18n rendering', () => {
  it('renders enable button text via i18n, not v-for variable', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ status: 'DISABLED' })])
    const wrapper = factory()
    await flushPromises()
    const html = wrapper.html()
    // Should contain the i18n key '启用' (common.enable), NOT '[object Object]'
    expect(html).toContain('启用')
    expect(html).not.toContain('[object')
  })

  it('renders disable text for enabled plugins via i18n', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType({ status: 'ENABLED' })])
    const wrapper = factory()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('禁用')
    expect(html).not.toContain('[object')
  })

  it('renders config button text via i18n', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([makeType()])
    const wrapper = factory()
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('插件配置')
  })
})
