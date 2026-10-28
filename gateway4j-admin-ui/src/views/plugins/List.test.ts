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

// Stub i18n-dependent SDK components at module level.
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
      common: {
        more: '更多', enable: '启用', disable: '禁用', delete: '删除'
      },
      plugin: {
        name: '插件名', id: '插件 ID', type: '类型',
        phase: '阶段', scope: '范围', status: '状态'
      }
    }
  }
})

function factory() {
  return mount(List, {
    global: { plugins: [i18n] }
  })
}

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listPlugins.mockReset().mockResolvedValue({
    records: [], total: 0, size: 20, current: 1, pages: 0
  })
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.deletePlugin.mockReset().mockResolvedValue(undefined)
})

describe('plugins/List.vue — initial state', () => {
  it('mounts without errors', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.html()).toContain('app-page')
  })

  it('starts with page=1, pageSize=20', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.page).toBe(1)
    expect(vm.pageSize).toBe(20)
  })

  it('starts with empty keyword, type, status', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.keyword).toBe('')
    expect(vm.type).toBe('')
    expect(vm.status).toBe('')
  })

  it('exposes 4 plugin types and 3 statuses in select options', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.typeOpts.map((o: any) => o.value)).toEqual(['BUILTIN', 'JAR', 'GROOVY', 'GROUP'])
    expect(vm.statusOpts.map((o: any) => o.value)).toEqual(['ENABLED', 'DISABLED', 'UNINSTALLED'])
  })

  it('calls listPlugins on mount with default pagination + no filters', async () => {
    factory()
    await flushPromises()
    expect(mocks.listPlugins).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      pluginType: undefined,
      status: undefined
    })
  })

  it('calls listPlugins exactly once per reload (no duplicate fetches)', async () => {
    const wrapper = factory()
    await flushPromises()
    mocks.listPlugins.mockClear()
    await (wrapper.vm as any).reload()
    expect(mocks.listPlugins).toHaveBeenCalledTimes(1)
  })
})

describe('plugins/List.vue — typeColor', () => {
  it('maps each plugin type to a tag color', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.typeColor('BUILTIN')).toBe('primary')
    expect(vm.typeColor('JAR')).toBe('warning')
    expect(vm.typeColor('GROOVY')).toBe('success')
    expect(vm.typeColor('GROUP')).toBe('info')
  })

  it('returns gray for unknown types', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    expect(vm.typeColor('UNKNOWN')).toBe('gray')
    expect(vm.typeColor('')).toBe('gray')
  })
})

describe('plugins/List.vue — filter passthrough', () => {
  it('passes pluginType filter to API when set', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.type = 'BUILTIN'
    await flushPromises()
    // Watcher fires after the next tick
    await new Promise((r) => setTimeout(r, 0))
    const calls = mocks.listPlugins.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.pluginType).toBe('BUILTIN')
  })

  it('passes status filter to API when set', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    vm.status = 'ENABLED'
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    const calls = mocks.listPlugins.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.status).toBe('ENABLED')
  })
})

describe('plugins/List.vue — actions', () => {
  it('enable(r) calls enablePlugin(r.id) and reloads', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    mocks.listPlugins.mockClear()
    await vm.enable({ id: 'p1' })
    expect(mocks.enablePlugin).toHaveBeenCalledWith('p1')
    expect(mocks.listPlugins).toHaveBeenCalled()
  })

  it('disable(r) calls disablePlugin(r.id) and reloads', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    mocks.listPlugins.mockClear()
    await vm.disable({ id: 'p1' })
    expect(mocks.disablePlugin).toHaveBeenCalledWith('p1')
    expect(mocks.listPlugins).toHaveBeenCalled()
  })

  it('del(r) calls deletePlugin(r.id) and reloads', async () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    mocks.listPlugins.mockClear()
    await vm.del({ id: 'p1' })
    expect(mocks.deletePlugin).toHaveBeenCalledWith('p1')
    expect(mocks.listPlugins).toHaveBeenCalled()
  })
})

describe('plugins/List.vue — pagination', () => {
  it('paginates current page in rows.total', async () => {
    mocks.listPlugins.mockReset()
    mocks.listPlugins.mockResolvedValue({
      records: [{ id: '1' }, { id: '2' }],
      total: 42, size: 20, current: 1, pages: 3
    })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.rows.length).toBe(2)
    expect(vm.total).toBe(42)
  })

  it('paginates by calling listPlugins with current page + pageSize', async () => {
    mocks.listPlugins.mockReset()
    mocks.listPlugins.mockResolvedValue({
      records: [], total: 0, size: 20, current: 1, pages: 0
    })
    const wrapper = factory()
    const vm = wrapper.vm as any
    await flushPromises()
    vm.page = 3
    vm.pageSize = 50
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    const calls = mocks.listPlugins.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.page).toBe(3)
    expect(lastCall.pageSize).toBe(50)
  })
})

describe('plugins/List.vue — loading state', () => {
  it('flips loading during reload and back to false after', async () => {
    const wrapper = factory()
    await flushPromises()
    // After mount's reload() has settled, set up a pending next call
    let resolveList: (v: any) => void = () => {}
    mocks.listPlugins.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const vm = wrapper.vm as any
    const p = vm.reload()
    await flushPromises()
    expect(vm.loading).toBe(true)
    resolveList({ records: [], total: 0 })
    await p
    await flushPromises()
    expect(vm.loading).toBe(false)
  })
})