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
  default: {
    name: 'FcEmpty',
    props: ['title', 'type'],
    template: '<div class="empty-stub" :data-type="type" :data-title="title" />'
  }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe'], template: '<table class="table-stub" />' }
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
      settings: { general: '通用设置', security: '安全设置', dict: '字典查询', theme: '主题', siteName: '站点名称', tokenExpiry: 'Token过期', refreshExpiry: 'Refresh过期' },
      common: { save: '保存', cancel: '取消' }
    }
  }
})

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

describe('Settings.vue — loadDict() error feedback', () => {
  it('starts with empty dictError', async () => {
    mocks.getDict.mockResolvedValue([])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('')
  })

  it('getDict failure on initial load sets dictError with server message', async () => {
    mocks.getDict.mockRejectedValue(new Error('字典服务不可用'))
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('字典服务不可用')
  })

  it('getDict failure on initial load sets dictError (visible when switching to dict tab)', async () => {
    mocks.getDict.mockRejectedValue(new Error('字典服务不可用'))
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    // Switch to dict tab to see the error
    ;(wrapper.vm as any).tab = 'dict'
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('字典服务不可用')
  })

  it('on API failure, dictError is set (checked via vm, not DOM)', async () => {
    mocks.getDict.mockRejectedValue(new Error('500'))
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('500')
  })

  it('truly empty dict (success + empty array) has empty entries', async () => {
    mocks.getDict.mockResolvedValue([])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).entries.length).toBe(0)
  })

  it('user-triggered loadDict() after failure clears stale error and retries', async () => {
    mocks.getDict.mockRejectedValueOnce(new Error('first failure'))
    mocks.getDict.mockResolvedValueOnce([{ value: 'X', label: 'X' }])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('first failure')
    await (wrapper.vm as any).loadDict()
    await flushPromises()
    expect((wrapper.vm as any).dictError).toBe('')
    expect((wrapper.vm as any).entries.length).toBe(1)
  })

  it('loadDict() called manually without code returns early without API call', async () => {
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    mocks.getDict.mockClear()
    ;(wrapper.vm as any).code = ''
    await (wrapper.vm as any).loadDict()
    expect(mocks.getDict).not.toHaveBeenCalled()
  })
})
