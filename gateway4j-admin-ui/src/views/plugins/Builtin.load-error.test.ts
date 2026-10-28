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

vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: {
    name: 'FcDialog',
    props: ['open', 'title', 'width'],
    template: '<div v-if="open" class="dialog-stub"><slot /><slot name="footer" /></div>'
  }
}))

vi.mock('@/components/PluginDynamicForm.vue', () => ({
  default: { name: 'PluginDynamicForm', template: '<div class="form-stub" />' }
}))

import Builtin from '@/views/plugins/Builtin.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', empty: '暂无数据', save: '保存', cancel: '取消', enable: '启用', disable: '禁用', saveFailed: '保存失败', actionFailed: '操作失败', loadFailed: '加载失败' },
      plugin: { configForm: '配置', name: '插件名', phase: '阶段' },
      emptyState: { processing: '加载中' }
    }
  }
})

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

describe('plugins/Builtin.vue — load error', () => {
  it('shows loadError when listBuiltinTypes fails', async () => {
    mocks.listBuiltinTypes.mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(Builtin, { global: { plugins: [i18n] } })
    await flushPromises()
    const el = wrapper.find('[data-testid="load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('网络错误')
  })

  it('does not show loadError on success', async () => {
    mocks.listBuiltinTypes.mockResolvedValue([{ plugin_id: 'rate-limiter', plugin_name: '限流', plugin_phase: 'PRE', status: 'ENABLED' }])
    const wrapper = mount(Builtin, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })
})
