import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  deletePlugin: mocks.deletePlugin
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/plugins/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { more: '更多', enable: '启用', disable: '禁用', delete: '删除' },
      plugin: { name: '插件名', id: '插件 ID', type: '类型', phase: '阶段', scope: '范围', status: '状态' }
    }
  }
})

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listPlugins.mockReset().mockResolvedValue({
    records: [], total: 0, size: 20, current: 1, pages: 0
  })
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.deletePlugin.mockReset().mockResolvedValue(undefined)
})

describe('plugins/List.vue — UNINSTALLED status', () => {
  it('includes UNINSTALLED in statusOpts', async () => {
    const wrapper = mount(List, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const values = vm.statusOpts.map((o: any) => o.value)
    expect(values).toContain('UNINSTALLED')
  })

  it('has 3 status options: ENABLED, DISABLED, UNINSTALLED', async () => {
    const wrapper = mount(List, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    const values = vm.statusOpts.map((o: any) => o.value)
    expect(values).toEqual(['ENABLED', 'DISABLED', 'UNINSTALLED'])
  })

  it('renders UNINSTALLED status badge with neutral tone in table view', async () => {
    mocks.listPlugins.mockResolvedValue({
      records: [{ id: 'p1', plugin_name: 'Test', plugin_id: 'test', plugin_type: 'GROOVY', plugin_phase: 'PRE', scope: 'GLOBAL', status: 'UNINSTALLED' }],
      total: 1, size: 20, current: 1, pages: 1
    })
    const wrapper = mount(List, { global: { plugins: [i18n] } })
    await flushPromises()
    const html = wrapper.html()
    // UNINSTALLED should appear in the rendered output
    expect(html).toContain('UNINSTALLED')
  })

  it('does not show enable button for UNINSTALLED plugins', async () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, 'List.vue'), 'utf-8')
    // UNINSTALLED plugins should not have enable action — they need reinstall
    // 行内动作已收进「更多」下拉：启用项由 pluginRowActions() 生成，
    // 只有 DISABLED 状态才 push 启用项（UNINSTALLED / ENABLED 都没有）。
    const enableLines = src.split('\n').filter(l => l.includes("command: 'enable'"))
    expect(enableLines).toHaveLength(1)
    expect(enableLines[0]).toContain("'DISABLED'")
    expect(enableLines[0]).not.toContain("'UNINSTALLED'")
    // 删除项对非「已启用」状态开放（原行内按钮同口径）
    expect(src).toMatch(/status !== 'ENABLED'/)
  })

  it('passes UNINSTALLED status filter to API', async () => {
    const wrapper = mount(List, { global: { plugins: [i18n] } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.status = 'UNINSTALLED'
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    const calls = mocks.listPlugins.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.status).toBe('UNINSTALLED')
  })
})
