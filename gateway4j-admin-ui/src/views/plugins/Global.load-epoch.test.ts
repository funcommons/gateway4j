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

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))

import Global from '@/views/plugins/Global.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { empty: '暂无数据', loadFailed: '加载失败' },
      plugin: { globalPrePhase: '前置', globalPostPhase: '后置' }
    }
  }
})

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listGlobalPlugins.mockReset().mockResolvedValue([])
  mocks.sortGlobalPlugins.mockReset().mockResolvedValue(undefined)
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
})

function factory() {
  return mount(Global, { global: { plugins: [i18n] } })
}

describe('plugins/Global.vue — load race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite plugins if a stale load resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listGlobalPlugins.mockReset()
    mocks.listGlobalPlugins
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.load()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond([{ id: 'p2', plugin_name: 'New Plugin', plugin_phase: 'PRE', plugin_type: 'BUILTIN', status: 'ENABLED' }])
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst([{ id: 'p1', plugin_name: 'Old Plugin', plugin_phase: 'PRE', plugin_type: 'BUILTIN', status: 'ENABLED' }])
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Plugins should reflect the second (newer) load
    expect(vm.prePlugins[0].plugin_name).toBe('New Plugin')
  })

  it('does not set loadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listGlobalPlugins.mockReset()
    mocks.listGlobalPlugins
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.load()
    await flushPromises()

    // Resolve second load successfully
    resolveSecond([])
    await flushPromises()

    // Reject the first (stale) load
    rejectFirst(new Error('stale error'))
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Error from stale load should NOT appear
    expect(vm.loadError).toBe('')
  })
})
