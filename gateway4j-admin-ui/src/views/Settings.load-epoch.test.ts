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

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Settings from '@/views/Settings.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      settings: { general: '通用设置', security: '安全设置', dict: '字典查询', theme: '主题', tokenExpiry: 'Token 过期时间', refreshExpiry: 'Refresh 过期时间', siteName: '站点名称' },
      common: { save: '保存', cancel: '取消', loadFailed: '加载失败' },
      emptyState: { processing: '处理中' }
    }
  }
})

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

describe('Settings.vue — loadConfig race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite form data if a stale loadConfig resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.getConfig.mockReset()
    mocks.getConfig
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any

    // First load is pending
    expect(vm.loading).toBe(true)

    // Trigger a second load (simulating route change or re-mount)
    const secondLoad = vm.loadConfig()
    await flushPromises()

    // Second load is also pending; resolve it first with new data
    resolveSecond({ site_name: 'New Site', language: 'en-US' })
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst({ site_name: 'Old Site', language: 'zh-CN' })
    await flushPromises()

    await secondLoad
    await flushPromises()

    // The form should reflect the second (newer) load, not the stale first one
    expect(vm.generalForm.site_name).toBe('New Site')
    expect(vm.generalForm.language).toBe('en-US')
  })

  it('does not set configLoadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.getConfig.mockReset()
    mocks.getConfig
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any

    // Trigger second load
    const secondLoad = vm.loadConfig()
    await flushPromises()

    // Resolve second load successfully
    resolveSecond({ site_name: 'OK' })
    await flushPromises()

    // Reject the first (stale) load
    rejectFirst(new Error('stale error'))
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Error from stale load should NOT appear
    expect(vm.configLoadError).toBe('')
  })

  it('increments loadEpoch on each loadConfig call', async () => {
    mocks.getConfig.mockResolvedValue({})
    const wrapper = mount(Settings, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any

    const epoch1 = vm.loadEpoch
    await vm.loadConfig()
    await flushPromises()
    const epoch2 = vm.loadEpoch
    expect(epoch2).toBeGreaterThan(epoch1)
  })
})
