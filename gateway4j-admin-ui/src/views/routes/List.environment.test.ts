import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// H7b 契约用例：路由列表环境维度 —— environment 查询参数（契约 2）/ 环境标签列（T4）/
// 顶栏切换联动刷新（T1）/ 发布变更说明随 body 提交（契约 5，T2）
const mocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  publishRoute: vi.fn(),
  offlineRoute: vi.fn(),
  deleteRoute: vi.fn(),
  duplicateRoute: vi.fn(),
  bulkPublishRoutes: vi.fn(),
  bulkOfflineRoutes: vi.fn(),
  bulkDeleteRoutes: vi.fn(),
  listEnvironments: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/routes', () => ({
  listRoutes: mocks.listRoutes,
  publishRoute: mocks.publishRoute,
  offlineRoute: mocks.offlineRoute,
  deleteRoute: mocks.deleteRoute,
  duplicateRoute: mocks.duplicateRoute,
  bulkPublishRoutes: mocks.bulkPublishRoutes,
  bulkOfflineRoutes: mocks.bulkOfflineRoutes,
  bulkDeleteRoutes: mocks.bulkDeleteRoutes
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

// FcTable 桩**不渲染默认插槽**。
//
// 原因：jsdom 下没有注册 ElementPlus，el-table-column 是未解析组件 —— 它的
// 作用域插槽 `<template #default="{ row }">` 拿不到参数，渲染时直接抛
// "Cannot destructure property 'row' of 'undefined'"（21 条 unhandled error，
// 2026-11-02 实测的唯一来源）。
// 「环境」列的结构断言走源码正则（见下方 T4 用例），不依赖插槽渲染出来的 DOM，
// 所以这里把插槽去掉，断言强度不变，只是把无意义的渲染噪声清掉。
vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<div class="table-stub" />' }
}))

import List from '@/views/routes/List.vue'
import { useEnvironmentStore } from '@/store/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { create: '新建', edit: '编辑', delete: '删除', publish: '发布', offline: '下线', import: '导入', empty: '暂无数据', more: '更多' },
      route: { name: '路由名', type: '类型', path: '路径', status: '状态', tags: '标签', bulkPublish: '批量发布' },
      env: { envCol: '环境', publishDialogTitle: '发布路由', changeDescBulkContext: '将对 {n} 条路由执行发布' }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/routes', component: { template: '<div />' } },
      { path: '/routes/new', component: { template: '<div />' } },
      { path: '/routes/:id', component: { template: '<div />' } },
      { path: '/routes/:id/canvas', component: { template: '<div />' } },
      { path: '/import-export', component: { template: '<div />' } }
    ]
  })
}

function makeRouteNode(over: Partial<any> = {}) {
  return {
    id: 'r1', route_name: 'route-1', route_type: 'BACKEND',
    path: '/api/x', status: 'DRAFT', sort_order: 0,
    remark: '', config_version: '1', created_at: 0, updated_at: 0,
    plugins: [], children: [], ...over
  }
}

async function factory(initial: any[] = []) {
  const router = makeRouter()
  await router.push('/routes')
  await router.isReady()
  mocks.listRoutes.mockResolvedValue(initial)
  const wrapper = mount(List, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

function makeEnvAvailable(envs: string[] = ['default', 'staging'], current = 'default') {
  const s = useEnvironmentStore()
  s.$patch({ available: true, loaded: true, environments: envs, current })
  return s
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.publishRoute.mockReset().mockResolvedValue(undefined)
  mocks.offlineRoute.mockReset().mockResolvedValue(undefined)
  mocks.deleteRoute.mockReset().mockResolvedValue(undefined)
  mocks.duplicateRoute.mockReset().mockResolvedValue({ id: 'c', route_name: 'c' })
  mocks.bulkPublishRoutes.mockReset().mockResolvedValue({ succeeded: [], failed: [] })
  mocks.bulkOfflineRoutes.mockReset().mockResolvedValue({ succeeded: [], failed: [] })
  mocks.bulkDeleteRoutes.mockReset().mockResolvedValue({ succeeded: [], failed: [] })
  mocks.listEnvironments.mockReset().mockRejectedValue(new Error('404'))
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
})

describe('List — 契约 2：GET /v1/routes?environment=', () => {
  it('降级（环境探测 404）→ 不携带 environment 参数（与旧口径一致）', async () => {
    await factory()
    expect(mocks.listRoutes).toHaveBeenCalledWith(undefined)
  })

  it('环境可用 → 携带当前环境参数', async () => {
    makeEnvAvailable(['default', 'staging'])
    const wrapper = await factory()
    mocks.listRoutes.mockClear()
    await (wrapper.vm as any).reload()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ environment: 'default' })
  })

  it('降级 + tag 过滤 → 仍然只有 {tag}', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.tagFilter = 'prod'
    mocks.listRoutes.mockClear()
    await vm.reload()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ tag: 'prod' })
  })

  it('环境可用 + tag 过滤 → {tag, environment} 同时携带', async () => {
    makeEnvAvailable(['default', 'staging'])
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.tagFilter = 'prod'
    mocks.listRoutes.mockClear()
    await vm.reload()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ tag: 'prod', environment: 'default' })
  })
})

describe('List — T1：顶栏切换环境联动刷新', () => {
  it('切换 current → 自动带新 environment 参数重拉', async () => {
    const s = makeEnvAvailable(['default', 'staging'])
    const wrapper = await factory()
    mocks.listRoutes.mockClear()
    s.setCurrent('staging')
    await flushPromises()
    expect(mocks.listRoutes).toHaveBeenCalledWith({ environment: 'staging' })
  })
})

describe('List — T4：环境小标签列', () => {
  // 注：jsdom 无 ElementPlus，el-table-column 未解析时其作用域插槽会让该渲染区域
  // 静默失败（既有 List 用例同样只走 vm 层断言），列结构走源码断言。
  it('模板结构：环境列存在且受 envReady 门控，单元格用 EnvTag 渲染', () => {
    const source = readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')
    expect(source).toMatch(/el-table-column v-if="envReady" :label="t\('env\.envCol'\)"/)
    expect(source).toMatch(/<EnvTag :environment/)
  })

  it('环境可用 → 路由节点 environment 透传到行数据（EnvTag default 灰 / 非 default 蓝）', async () => {
    makeEnvAvailable(['default', 'staging'])
    const wrapper = await factory([
      makeRouteNode({ id: 'a', environment: 'staging' }),
      makeRouteNode({ id: 'b' })
    ])
    const flat = (wrapper.vm as any).flatRows
    expect(flat[0].environment).toBe('staging')
    expect(flat[1].environment).toBeUndefined()
  })

  it('环境功能降级（404）→ envReady=false，环境列整列隐藏', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).envReady).toBe(false)
  })
})

describe('List — 契约 5 + T2：发布变更说明随 body 提交', () => {
  it('单条发布：publish() 开弹窗，确认后 publishRoute(id, 说明)', async () => {
    const wrapper = await factory([makeRouteNode({ id: 'p1', status: 'DRAFT' })])
    const vm = wrapper.vm as any
    vm.publish({ id: 'p1' })
    expect(vm.publishDialogOpen).toBe(true)
    expect(mocks.publishRoute).not.toHaveBeenCalled()
    await vm.onPublishConfirm('首次发布')
    expect(mocks.publishRoute).toHaveBeenCalledWith('p1', '首次发布')
  })

  it('批量发布：runBulk(publish) 开弹窗，确认后 bulkPublishRoutes(ids, 说明)', async () => {
    const wrapper = await factory([makeRouteNode({ id: 'a' }), makeRouteNode({ id: 'b' })])
    const vm = wrapper.vm as any
    vm.selectedRows = [makeRouteNode({ id: 'a' }), makeRouteNode({ id: 'b' })]
    await vm.runBulk('publish')
    expect(mocks.bulkPublishRoutes).not.toHaveBeenCalled()
    await vm.onPublishConfirm('批量说明')
    expect(mocks.bulkPublishRoutes).toHaveBeenCalledWith(['a', 'b'], '批量说明')
  })
})
