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

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe'], template: '<table class="table-stub" />' }
}))

import Settings from '@/views/Settings.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', failed: '操作失败', loadFailed: '加载失败', saveFailed: '保存失败', empty: '暂无数据' },
      settings: { tabGeneral: '通用', tabSecurity: '安全', tabDict: '字典', tabTheme: '主题', siteName: '站点名称', language: '语言', tokenExpiry: 'Token 过期时间', refreshExpiry: 'Refresh 过期时间', dictPlaceholder: '输入字典编码', dictQuery: '查询', themeHint: '选择主题', saveSuccess: '保存成功', tokenExpiryRange: '范围 1-720', refreshExpiryRange: '范围 1-365' }
    }
  }
})

async function factory() {
  return mount(Settings, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.getDict.mockReset().mockResolvedValue([])
})

describe('Settings.vue — dict query loading indicator', () => {
  it('has dictLoading ref with default false', async () => {
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.dictLoading).toBe(false)
  })

  it('sets dictLoading = true while loadDict is in-flight', async () => {
    let resolveDict: (v: any) => void = () => {}
    mocks.getDict.mockImplementation(() => new Promise((resolve) => { resolveDict = resolve }))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const p = vm.loadDict()
    await flushPromises()
    expect(vm.dictLoading).toBe(true)
    resolveDict([])
    await p
    expect(vm.dictLoading).toBe(false)
  })

  it('sets dictLoading = false after loadDict resolves', async () => {
    mocks.getDict.mockResolvedValue([{ value: 'A', label: 'Alpha' }])
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadDict()
    expect(vm.dictLoading).toBe(false)
  })

  it('sets dictLoading = false even when loadDict rejects', async () => {
    mocks.getDict.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.loadDict()
    expect(vm.dictLoading).toBe(false)
  })
})
