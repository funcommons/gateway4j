import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listGlobalPlugins: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/plugins', () => ({
  listGlobalPlugins: mocks.listGlobalPlugins,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

import Global from '@/views/plugins/Global.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { loadFailed: '加载失败', actionFailed: '操作失败', sortFailed: '排序失败', empty: '暂无数据' },
      plugin: { globalPrePhase: '前置 (PRE)', globalPostPhase: '后置 (POST)' }
    }
  }
})

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listGlobalPlugins.mockReset().mockResolvedValue([])
  mocks.sortGlobalPlugins.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
})

function factory() {
  return mount(Global, { global: { plugins: [i18n] } })
}

describe('plugins/Global.vue — i18n error fallbacks', () => {
  it('uses i18n loadFailed fallback when listGlobalPlugins rejects without message', async () => {
    mocks.listGlobalPlugins.mockRejectedValue(new Error())
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('加载失败')
  })

  it('uses i18n actionFailed fallback when togglePlugin rejects without message', async () => {
    mocks.listGlobalPlugins.mockResolvedValue([{ id: 'p1', plugin_name: 'test', plugin_type: 'BUILTIN', plugin_phase: 'PRE', status: 'ENABLED' }])
    mocks.disablePlugin.mockRejectedValue(new Error())
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.togglePlugin({ id: 'p1', status: 'ENABLED' })
    await flushPromises()
    expect(vm.actionError).toBe('操作失败')
  })

  it('uses i18n sortFailed fallback when saveSort rejects without message', async () => {
    mocks.listGlobalPlugins.mockResolvedValue([{ id: 'p1', plugin_name: 'test', plugin_type: 'BUILTIN', plugin_phase: 'PRE', status: 'ENABLED' }])
    mocks.sortGlobalPlugins.mockRejectedValue(new Error())
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.saveSort('PRE', [{ id: 'p1' }])
    await flushPromises()
    expect(vm.actionError).toBe('排序失败')
  })
})
