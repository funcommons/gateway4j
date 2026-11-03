import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

// 用例跑完必须卸载 wrapper：Settings.vue 的 load()/save() 链路是异步的，
// 不卸载的话 Vue 调度器会在用例结束后继续 patch 已销毁的 vnode，
// 抛 "Cannot read properties of null (reading 'emitsOptions')" —— 计入 vitest
// 的 unhandled error（2026-11-02 实测：本文件是剩余 6 条的来源）。
enableAutoUnmount(afterEach)

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — save functions send only own tab fields', () => {
  it('saveGeneral does not send security fields (token_expiry_hours, refresh_expiry_days)', () => {
    // saveGeneral should only send general tab fields (site_name, language).
    // Currently it also sends token_expiry_hours and refresh_expiry_days from
    // securityForm, which can overwrite backend values with stale defaults
    // if loadConfig failed or the user hasn't visited the security tab.
    const saveGeneralMatch = source.match(/async function saveGeneral\(\)[\s\S]*?^}/m)
    expect(saveGeneralMatch).toBeTruthy()
    const body = saveGeneralMatch![0]
    expect(body).not.toMatch(/token_expiry_hours/)
    expect(body).not.toMatch(/refresh_expiry_days/)
  })

  it('saveSecurity does not send general fields (site_name, language)', () => {
    // saveSecurity should only send security tab fields.
    const saveSecurityMatch = source.match(/async function saveSecurity\(\)[\s\S]*?^}/m)
    expect(saveSecurityMatch).toBeTruthy()
    const body = saveSecurityMatch![0]
    expect(body).not.toMatch(/site_name/)
    expect(body).not.toMatch(/language/)
  })
})

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  getDict: vi.fn().mockResolvedValue([])
}))

// 本地 mock 必须覆盖 Settings.vue 用到的**全部** Fc 组件 ——
// 少一个就在渲染期抛 "No \"Xxx\" export is defined on the \"@/components\" mock"，
// 抛在 Vue 的 render 里会变成 unhandled rejection（用例仍绿，但污染 vitest 统计）。
// 2026-11-02 实测：FcFormItem / FcHelpTip / FcTag / FcStatusBadge / FcPagination 都曾漏过。
vi.mock('@/components', () => ({
  FcSection: { template: '<div><slot /></div>' },
  FcTabsPanel: { template: '<div><slot name="tab-general" /><slot name="tab-security" /><slot name="tab-dict" /><slot name="tab-theme" /></div>', props: ['modelValue', 'tabs'] },
  FcInput: { template: '<input />', props: ['modelValue', 'type', 'placeholder', 'clearable'] },
  FcFormItem: { template: '<div class="fc-form-item"><slot /></div>', props: ['label', 'prop'] },
  FcSelect: { template: '<select />', props: ['modelValue', 'options', 'clearable', 'placeholder'] },
  FcButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['variant', 'loading'] },
  FcTable: { template: '<table />', props: ['data', 'stripe'] },
  FcEmpty: { template: '<div />', props: ['title'] },
  FcSkeleton: { template: '<div class="fc-skeleton" />', props: ['variant', 'rows'] },
  FcInputNumber: { template: '<input type="number" />', props: ['modelValue', 'min', 'max'] },
  FcDatePicker: { template: '<input />', props: ['modelValue', 'type'] },
  FcTag: { template: '<span class="fc-tag"><slot /></span>', props: ['color', 'size'] },
  FcStatusBadge: { template: '<span class="fc-status-badge"><slot /></span>', props: ['tone', 'label', 'dot'] },
  FcPagination: { template: '<div class="fc-pagination" />', props: ['currentPage', 'pageSize', 'total'] },
  FcHelpTip: { template: '<span class="fc-help-tip" />', props: ['content', 'text'] },
  FcThemeSwitcher: { template: '<div />' },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
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
      settings: { siteName: '站点名称', language: '语言', tokenExpiry: 'Token过期时间', refreshExpiry: 'Refresh过期时间', dictPlaceholder: '字典编码', dictQuery: '查询' },
      common: { save: '保存', failed: '操作失败', loadFailed: '加载失败', saveFailed: '保存失败' },
      emptyState: { processing: '加载中' }
    }
  }
})

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({
    site_name: 'GW4J', language: 'zh-CN', token_expiry_hours: 24, refresh_expiry_days: 7
  })
  mocks.saveConfig.mockReset().mockResolvedValue({})
})

async function factory() {
  const wrapper = mount(Settings, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

describe('Settings.vue — saveGeneral only sends general fields', () => {
  it('saveGeneral payload contains site_name and language but NOT security fields', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.generalForm.site_name = 'NewSite'
    vm.generalForm.language = 'en-US'
    await vm.saveGeneral()
    await flushPromises()
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1)
    const arg = mocks.saveConfig.mock.calls[0][1]
    expect(arg.site_name).toBe('NewSite')
    expect(arg.language).toBe('en-US')
    expect(arg.token_expiry_hours).toBeUndefined()
    expect(arg.refresh_expiry_days).toBeUndefined()
  })
})

describe('Settings.vue — saveSecurity only sends security fields', () => {
  it('saveSecurity payload contains token_expiry_hours and refresh_expiry_days but NOT general fields', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.securityForm.token_expiry_hours = 48
    vm.securityForm.refresh_expiry_days = 14
    // Bypass form validation
    if (vm.securityFormRef) vm.securityFormRef.validate = () => Promise.resolve()
    await vm.saveSecurity()
    await flushPromises()
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1)
    const arg = mocks.saveConfig.mock.calls[0][1]
    expect(arg.token_expiry_hours).toBe(48)
    expect(arg.refresh_expiry_days).toBe(14)
    expect(arg.site_name).toBeUndefined()
    expect(arg.language).toBeUndefined()
  })
})
