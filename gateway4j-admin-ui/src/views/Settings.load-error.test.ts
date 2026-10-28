import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  getDict: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  getDict: mocks.getDict
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub">{{ title }}</div>' }
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
      common: { save: '保存', saveFailed: '保存失败', loadFailed: '加载失败', empty: '暂无数据' },
      settings: {
        tabGeneral: '通用', tabSecurity: '安全', tabDict: '字典', tabTheme: '主题',
        siteName: '站点名', language: '语言', tokenExpiry: 'Token 过期', refreshExpiry: '刷新过期',
        dictPlaceholder: '输入代码', dictQuery: '查询', themeHint: '主题提示',
        tokenExpiryRange: '1-720', refreshExpiryRange: '1-365'
      },
      emptyState: { processing: '加载中' }
    }
  }
})

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.getDict.mockReset().mockResolvedValue([])
})

describe('Settings.vue — loadConfig error', () => {
  it('shows loadError when getConfig fails', async () => {
    mocks.getConfig.mockRejectedValue(new Error('服务不可用'))
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const el = wrapper.find('[data-testid="config-load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('服务不可用')
  })

  it('does not show loadError on success', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'Test' })
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="config-load-error"]').exists()).toBe(false)
  })
})
