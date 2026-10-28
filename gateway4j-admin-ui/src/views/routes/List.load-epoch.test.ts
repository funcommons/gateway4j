import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute
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
  default: { name: 'FcTable', props: ['data', 'stripe', 'loading'], template: '<table class="table-stub" />' }
}))

import List from '@/views/routes/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { create: '新建', import: '导入', more: '更多', loadFailed: '加载失败' },
      route: {
        name: '路由名称', type: '类型', status: '状态', path: '路径',
        statusAll: '全部', statusDraft: '草稿', statusPublished: '已发布',
        statusChanging: '变更中', statusOffline: '已下线',
        searchPlaceholder: '搜索路由名', canvas: '画布',
        typeDispatch: '分发', typeBackend: '后置',
        expandAll: '全部展开', collapseAll: '全部折叠',
        confirmDelete: '确定删除?'
      }
    }
  }
})

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

function factory() {
  return mount(List, { global: { plugins: [i18n] } })
}

describe('routes/List.vue — reload race guard', () => {
  it('has a loadEpoch variable for race condition protection', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(typeof vm.loadEpoch).toBe('number')
  })

  it('does not overwrite rows if a stale reload resolves after a newer one', async () => {
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listRoutes.mockReset()
    mocks.listRoutes
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.reload()
    await flushPromises()

    // Resolve second load first with new data
    resolveSecond([{ id: 'r2', route_name: 'New Route', status: 'DRAFT' }])
    await flushPromises()

    // Now resolve the first (stale) load with old data
    resolveFirst([{ id: 'r1', route_name: 'Old Route', status: 'PUBLISHED' }])
    await flushPromises()

    await secondLoad
    await flushPromises()

    // Rows should reflect the second (newer) load
    expect(vm.rows[0].route_name).toBe('New Route')
  })

  it('does not set loadError from a stale rejected load', async () => {
    let rejectFirst: (e: Error) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}

    mocks.listRoutes.mockReset()
    mocks.listRoutes
      .mockImplementationOnce(() => new Promise((_, rej) => { rejectFirst = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any

    const secondLoad = vm.reload()
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
