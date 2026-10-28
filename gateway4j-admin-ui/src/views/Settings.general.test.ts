import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

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

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
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
      settings: { general: '通用设置', dict: '字典查询', theme: '主题', security: '安全设置', tokenExpiry: 'Token 过期时间(小时)', refreshExpiry: 'Refresh Token 过期时间(天)', siteName: '站点名称' },
      common: { save: '保存', cancel: '取消' }
    }
  }
})

function factory() {
  return mount(Settings, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

describe('Settings.vue — tabs', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('has 5 tabs (general, security, dict, theme, changes)', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.tabs.length).toBe(5)
    expect(vm.tabs.map((t: any) => t.value)).toEqual(['general', 'security', 'dict', 'theme', 'changes'])
  })

  it('defaults to general tab', async () => {
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).tab).toBe('general')
  })
})

describe('Settings.vue — general settings', () => {
  it('loads config on mount', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'Gateway4j', language: 'zh-CN' })
    const wrapper = factory()
    await flushPromises()
    expect(mocks.getConfig).toHaveBeenCalledWith('system')
  })

  it('populates form from config response', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'My Gateway', language: 'en-US' })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.generalForm.site_name).toBe('My Gateway')
    expect(vm.generalForm.language).toBe('en-US')
  })

  it('saves general config', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'Gateway4j', language: 'zh-CN' })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.generalForm.site_name = 'New Name'
    await vm.saveGeneral()
    await flushPromises()
    expect(mocks.saveConfig).toHaveBeenCalledWith('system', expect.objectContaining({ site_name: 'New Name' }))
  })

  it('shows save error on failure', async () => {
    mocks.getConfig.mockResolvedValue({ site_name: 'Gateway4j', language: 'zh-CN' })
    mocks.saveConfig.mockRejectedValue(new Error('保存失败'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.saveGeneral()
    await flushPromises()
    expect(vm.saveError).toBe('保存失败')
  })
})

describe('Settings.vue — security settings', () => {
  it('populates security form from config', async () => {
    mocks.getConfig.mockResolvedValue({ token_expiry_hours: 2, refresh_expiry_days: 30 })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.securityForm.token_expiry_hours).toBe(2)
    expect(vm.securityForm.refresh_expiry_days).toBe(30)
  })

  it('saves security config', async () => {
    mocks.getConfig.mockResolvedValue({ token_expiry_hours: 2, refresh_expiry_days: 30 })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.securityForm.token_expiry_hours = 4
    await vm.saveSecurity()
    await flushPromises()
    expect(mocks.saveConfig).toHaveBeenCalledWith('system', expect.objectContaining({ token_expiry_hours: 4 }))
  })
})
