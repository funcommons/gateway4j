import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  getDict: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getDict: mocks.getDict,
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
}))

import Settings from '@/views/Settings.vue'

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      settings: { general: '通用设置', security: '安全设置', dict: '字典查询', theme: '主题', tokenExpiry: 'Token 过期时间', refreshExpiry: 'Refresh 过期时间', siteName: '站点名称' },
      common: { save: '保存', cancel: '取消' },
      emptyState: { processing: '处理中' }
    }
  }
})

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

describe('Settings.vue — loading state', () => {
  it('shows loading indicator while config is being fetched', async () => {
    let resolveConfig: (v: any) => void = () => {}
    mocks.getConfig.mockReset()
    mocks.getConfig.mockImplementation(() => new Promise((resolve) => { resolveConfig = resolve }))

    const wrapper = mount(Settings, { global: { plugins: [i18n] } })

    // While loading, the component should indicate loading state
    const vm = wrapper.vm as any
    expect(vm.loading).toBe(true)

    // There should be a visible loading indicator in the DOM
    const html = wrapper.html()
    const hasLoadingIndicator = html.includes('fc-skeleton') || html.includes('aria-busy') || html.includes('loading')
    expect(hasLoadingIndicator).toBe(true)

    resolveConfig({})
    await flushPromises()
    expect(vm.loading).toBe(false)
  })

  it('hides loading indicator after config loads', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'Test' })
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.loading).toBe(false)
  })
})
