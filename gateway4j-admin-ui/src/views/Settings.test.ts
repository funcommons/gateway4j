import { describe, it, expect, beforeEach, vi } from 'vitest'

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

// Stub i18n-dependent SDK components at the module level so their imports
// resolve to our test stubs instead of the real i18n-using ones.
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe'], template: '<table class="table-stub" />' }
}))

import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
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
      common: { save: '保存', cancel: '取消' }
    }
  }
})

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

describe('Settings.vue', () => {
  it('mounts without errors and calls getDict with default code', async () => {
    mocks.getDict.mockResolvedValue([])
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(mocks.getDict).toHaveBeenCalledWith('ROUTE_TYPE')
    expect(wrapper.html()).toContain('app-page')
  })

  it('renders the five tabs (general, security, dict, theme, changes)', () => {
    mocks.getDict.mockResolvedValue([])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(5)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['general', 'security', 'dict', 'theme', 'changes'])
  })

  it('starts with default tab = "general"', () => {
    mocks.getDict.mockResolvedValue([])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    expect((wrapper.vm as any).tab).toBe('general')
  })

  it('starts with default code = "ROUTE_TYPE"', () => {
    mocks.getDict.mockResolvedValue([])
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    expect((wrapper.vm as any).code).toBe('ROUTE_TYPE')
  })

  it('populates entries from getDict response on mount', async () => {
    mocks.getDict.mockResolvedValue([
      { value: 'BACKEND', label: '后置路由' },
      { value: 'DISPATCH', label: '分发路由' }
    ])
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.entries.length).toBe(2)
    expect(vm.entries[0].value).toBe('BACKEND')
    expect(vm.entries[1].label).toBe('分发路由')
  })

  it('loadDict() returns early when code is empty', async () => {
    mocks.getDict.mockResolvedValue([{ value: 'X', label: 'X' }])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    mocks.getDict.mockClear()
    ;(wrapper.vm as any).code = ''
    await (wrapper.vm as any).loadDict()
    // getDict was called once on mount but not again with empty code
    expect(mocks.getDict).not.toHaveBeenCalled()
  })

  it('loadDict() with non-empty code fetches and assigns entries', async () => {
    mocks.getDict.mockResolvedValue([])
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    mocks.getDict.mockClear()
    mocks.getDict.mockResolvedValue([{ value: 'A', label: 'Alpha' }])
    ;(wrapper.vm as any).code = 'PLUGIN_TYPE'
    await (wrapper.vm as any).loadDict()
    expect(mocks.getDict).toHaveBeenCalledWith('PLUGIN_TYPE')
    expect((wrapper.vm as any).entries.length).toBe(1)
  })

  it('handles getDict failure gracefully (no crash, entries stays empty)', async () => {
    mocks.getDict.mockRejectedValue(new Error('500'))
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    expect((wrapper.vm as any).entries).toEqual([])
  })
})