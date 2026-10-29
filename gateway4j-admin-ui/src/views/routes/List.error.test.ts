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
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/routes/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', edit: '编辑', delete: '删除', publish: '发布',
        offline: '下线', import: '导入', empty: '暂无数据', more: '更多'
      },
      route: {
        name: '路由名', type: '类型', path: '路径', status: '状态'
      }
    }
  }
})

function factory() {
  return mount(List, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-table-column': { template: '<col />' }
      }
    }
  })
}

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
})

describe('List.vue — error resilience', () => {
  it('handles listRoutes rejection on mount without unhandled rejection', async () => {
    mocks.listRoutes.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.rows).toEqual([])
    expect(vm.loading).toBe(false)
  })

  it('handles publish() rejection without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.publishRoute.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // H7b T2：publish 先开变更说明弹窗，确认后提交
    vm.publish({ id: 'p1' })
    await vm.onPublishConfirm('发布说明')
    // reload should NOT be called when publish fails
    expect(mocks.listRoutes.mock.calls.length).toBe(1)
    expect(vm.actionError).toBeTruthy()
  })

  it('handles offline() rejection without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.offlineRoute.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.offline({ id: 'p1' })
    // reload should NOT be called when offline fails
    expect(mocks.listRoutes.mock.calls.length).toBe(1)
    expect(vm.actionError).toBeTruthy()
  })

  it('handles del() rejection without unhandled rejection', async () => {
    mocks.listRoutes.mockResolvedValue([])
    mocks.deleteRoute.mockRejectedValue(new Error('500'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.del({ id: 'p1' })
    // reload should NOT be called when delete fails
    expect(mocks.listRoutes.mock.calls.length).toBe(1)
    expect(vm.actionError).toBeTruthy()
  })

  it('reload() flipping loading flag works even on rejection', async () => {
    let resolveList: (v: any) => void = () => {}
    mocks.listRoutes.mockReset()
    mocks.listRoutes.mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const p = vm.reload()
    expect(vm.loading).toBe(true)
    resolveList([])
    await p
    expect(vm.loading).toBe(false)
  })
})