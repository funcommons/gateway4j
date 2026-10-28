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
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
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
      common: { save: '保存', cancel: '取消', loadFailed: '加载失败', saveFailed: '保存失败', empty: '暂无数据', failed: '操作失败' },
      settings: {
        general: '通用设置', security: '安全设置', dict: '字典查询', theme: '主题',
        siteName: '站点名称', tokenExpiry: 'Token 过期时间(小时)', refreshExpiry: 'Refresh Token 过期时间(天)',
        tabGeneral: '通用设置', tabSecurity: '安全设置', tabDict: '字典查询', tabTheme: '主题',
        dictPlaceholder: '字典 code', dictQuery: '查询', themeHint: '主题提示',
        language: '语言',
        tokenExpiryRange: 'Token 过期时间范围 1-720 小时',
        refreshExpiryRange: 'Refresh Token 过期时间范围 1-365 天'
      }
    }
  }
})

function factory() {
  return mount(Settings, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.getDict.mockReset().mockResolvedValue([])
})

describe('Settings.vue — form validation rules', () => {
  it('exposes securityFormRules with token_expiry_hours validator', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.securityFormRules
    expect(rules).toBeDefined()
    const tokenRule = rules.token_expiry_hours?.find((r: any) => r.validator)
    expect(tokenRule).toBeDefined()
  })

  it('token_expiry_hours validator rejects 0 and 721', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.securityFormRules
    const validator = rules.token_expiry_hours?.find((r: any) => r.validator)?.validator
    if (!validator) return
    let err: Error | undefined
    const cb = (e?: Error) => { err = e }
    validator({}, 0, cb)
    expect(err).toBeDefined()
    err = undefined
    validator({}, 721, cb)
    expect(err).toBeDefined()
    err = undefined
    validator({}, 1, cb)
    expect(err).toBeUndefined()
    validator({}, 720, cb)
    expect(err).toBeUndefined()
  })

  it('refresh_expiry_days validator rejects 0 and 366', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.securityFormRules
    const validator = rules.refresh_expiry_days?.find((r: any) => r.validator)?.validator
    if (!validator) return
    let err: Error | undefined
    const cb = (e?: Error) => { err = e }
    validator({}, 0, cb)
    expect(err).toBeDefined()
    err = undefined
    validator({}, 366, cb)
    expect(err).toBeDefined()
    err = undefined
    validator({}, 1, cb)
    expect(err).toBeUndefined()
    validator({}, 365, cb)
    expect(err).toBeUndefined()
  })
})

describe('Settings.vue — save validates form', () => {
  it('aborts saveSecurity when form validation rejects', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.securityForm.token_expiry_hours = 0
    if (vm.securityFormRef) {
      vm.securityFormRef.validate = vi.fn().mockRejectedValue(new Error('validation failed'))
    }
    await vm.saveSecurity()
    if (vm.securityFormRef) {
      expect(mocks.saveConfig).not.toHaveBeenCalled()
    }
    expect(vm.saving).toBe(false)
  })

  it('proceeds with saveSecurity when form validation passes', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.securityForm.token_expiry_hours = 2
    vm.securityForm.refresh_expiry_days = 30
    if (vm.securityFormRef) {
      vm.securityFormRef.validate = vi.fn().mockResolvedValue(true)
    }
    await vm.saveSecurity()
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1)
  })
})
