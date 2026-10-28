import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

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

function factory() {
  return mount(List, { global: { plugins: [i18n] } })
}

describe('plugins/List.vue — reload race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite rows if a stale reload resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listPlugins.mockReset()
    mocks.listPlugins
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.reload()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond({ records: [{ id: 'p2', plugin_name: 'New Plugin' }], total: 1, size: 20, current: 1, pages: 1 })
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst({ records: [{ id: 'p1', plugin_name: 'Old Plugin' }], total: 1, size: 20, current: 1, pages: 1 })
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Rows should reflect the second (newer) load
    expect(vm.rows[0].plugin_name).toBe('New Plugin')
  })

  it('does not set loadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listPlugins.mockReset()
    mocks.listPlugins
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.reload()
    await flushPromises()

    // Resolve second load successfully
    resolveSecond({ records: [], total: 0, size: 20, current: 1, pages: 0 })
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
