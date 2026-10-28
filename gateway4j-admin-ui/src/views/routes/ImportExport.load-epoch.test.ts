import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
}))

import ImportExport from '@/views/routes/ImportExport.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      importExport: { exportTitle: '导出', importTitle: '导入', tabExport: '导出', tabImport: '导入' },
      common: { loadFailed: '加载失败' }
    }
  }
})

beforeEach(() => {
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.exportRoutes.mockReset().mockResolvedValue({})
  mocks.validateImport.mockReset().mockResolvedValue({})
  mocks.importRoutes.mockReset().mockResolvedValue({})
})

function factory() {
  return mount(ImportExport, { global: { plugins: [i18n] } })
}

describe('routes/ImportExport.vue — loadRoutes race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite allRoutes if a stale loadRoutes resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listRoutes.mockReset()
    mocks.listRoutes
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.loadRoutes()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond([{ id: 'r2', route_name: 'New Route' }])
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst([{ id: 'r1', route_name: 'Old Route' }])
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Routes should reflect the second (newer) load
    expect(vm.allRoutes[0].route_name).toBe('New Route')
  })
})
