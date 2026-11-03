import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

// H7b 契约用例：导入导出页环境维度 ——
//   契约 3：导入 body 可选 target_environment；预检/结果带 environment 与 package_environment
//   契约 4：导出 ?environment=
//   契约 6 + T3：环境对比 Tab（三段渲染 / 失败空态）
//   T1：导入对话框「目标环境」默认当前环境
const mocks = vi.hoisted(() => ({
  exportRoutes: vi.fn(),
  validateImport: vi.fn(),
  importRoutes: vi.fn(),
  listRoutes: vi.fn(),
  createImportSnapshot: vi.fn(),
  listEnvironments: vi.fn(),
  getEnvironmentDiff: vi.fn()
}))

vi.mock('@/api/routes', () => ({
  exportRoutes: mocks.exportRoutes,
  validateImport: mocks.validateImport,
  importRoutes: mocks.importRoutes,
  listRoutes: mocks.listRoutes,
  createImportSnapshot: mocks.createImportSnapshot
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments,
  getEnvironmentDiff: mocks.getEnvironmentDiff
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'stripe'], template: '<div class="table-stub" />' }
}))

import ImportExport from '@/views/routes/ImportExport.vue'
import { useEnvironmentStore } from '@/store/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { search: '搜索', empty: '暂无数据' },
      route: { name: '路由名称' },
      importExport: {
        tabExport: '导出', tabImport: '导入', tabEnvDiff: '环境对比', status: '状态',
        routePackage: '路由包', downloadPackage: '下载路由包', preCheck: '预检', doImport: '导入',
        strategy: '冲突策略', error: '报错', preCheckHint: '导入前请先预检',
        reportValid: '可导入：是', reportInvalid: '可导入：否',
        targetEnv: '目标环境', reportEnvironment: '目标环境', reportPackageEnvironment: '路由包来源环境',
        diffFrom: '环境 A（from）', diffTo: '环境 B（to）', diffRun: '对比',
        diffOnlyInFrom: '仅 {env} 有', diffOnlyInTo: '仅 {env} 有', diffChanged: '字段变更',
        diffColField: '字段', diffColFrom: 'A 值', diffColTo: 'B 值',
        diffUnavailable: '环境对比服务不可用', diffNoChanges: '两环境路由配置一致'
      },
      env: { switcherLabel: '环境' }
    }
  }
})

function factory() {
  return mount(ImportExport, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea-stub />' },
        // 折叠面板已换成 Fc 组件（内部渲染 EP 的 Collapse / CollapseItem），
        // 所以这里按 EP 组件的注册名（PascalCase）打桩，类名保持不变。
        'ElCollapse': { template: '<div class="collapse-stub"><slot /></div>' },
        'ElCollapseItem': { props: ['name', 'title'], template: '<div class="collapse-item-stub"><slot /></div>' }
      }
    }
  })
}

function makeEnvAvailable(envs: string[] = ['default', 'staging', 'prod'], current = 'default') {
  const s = useEnvironmentStore()
  s.$patch({ available: true, loaded: true, environments: envs, current })
  return s
}

function makeDiffResult() {
  return {
    from: 'default',
    to: 'staging',
    only_in_from: ['only-a', { route_name: 'only-obj' }],
    only_in_to: ['only-b'],
    changed: [
      { route_name: 'changed-1', fields: { path: { from: '/a', to: '/b' }, upstream_url: { from: 'http://a', to: 'http://b' } } },
      { route_name: 'changed-2', fields: {} }
    ]
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.exportRoutes.mockReset().mockResolvedValue({ version: '1', routes: [] })
  mocks.validateImport.mockReset().mockResolvedValue({ is_valid: true })
  mocks.importRoutes.mockReset().mockResolvedValue({ total: 0, created: 0, updated: 0, skipped: 0, errors: [] })
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.createImportSnapshot.mockReset().mockRejectedValue(new Error('Not Found'))
  mocks.listEnvironments.mockReset().mockRejectedValue(new Error('404'))
  mocks.getEnvironmentDiff.mockReset()
})

describe('ImportExport — T1：导入目标环境（默认当前环境）', () => {
  it('降级（/v1/environments 404）→ 目标环境选择器不渲染', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="import-target-env"]').exists()).toBe(false)
  })

  it('环境可用 → 目标环境选择器渲染且默认当前环境', async () => {
    makeEnvAvailable(['default', 'staging'], 'default')
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="import-target-env"]').exists()).toBe(true)
    expect((wrapper.vm as any).targetEnv).toBe('default')
  })
})

describe('ImportExport — 契约 3：导入 body 可选 target_environment', () => {
  it('降级 → importRoutes 不携带第三参（body 保持旧形状）', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    await vm.onImport()
    expect(mocks.importRoutes).toHaveBeenCalledWith({ version: '1.0', routes: [] }, 'SKIP')
  })

  it('环境可用 → importRoutes 携带 target_environment', async () => {
    makeEnvAvailable(['default', 'staging'], 'staging')
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.jsonText = '{"version":"1.0","routes":[]}'
    await vm.onImport()
    expect(mocks.importRoutes).toHaveBeenCalledWith({ version: '1.0', routes: [] }, 'SKIP', 'staging')
  })
})

describe('ImportExport — 契约 3：预检/结果带 environment 与 package_environment', () => {
  it('报告下发 environment / package_environment 时展示（旧包 = default）', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.report = { is_valid: true, environment: 'staging', package_environment: 'default' }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="report-environment"]').text()).toContain('staging')
    expect(wrapper.find('[data-testid="report-package-environment"]').text()).toContain('default')
  })

  it('旧后端报告不带环境字段 → 不渲染对应行', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.report = { is_valid: true }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="report-environment"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="report-package-environment"]').exists()).toBe(false)
  })
})

describe('ImportExport — 契约 4：导出 ?environment=', () => {
  it('降级 → exportRoutes 不携带第三参', async () => {
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).onExport()
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, undefined)
  })

  it('环境可用 → exportRoutes 携带当前环境', async () => {
    makeEnvAvailable(['default', 'staging'], 'default')
    const wrapper = factory()
    await flushPromises()
    await (wrapper.vm as any).onExport()
    expect(mocks.exportRoutes).toHaveBeenCalledWith(undefined, undefined, 'default')
  })
})

describe('ImportExport — 契约 6 + T3：环境对比 Tab', () => {
  it('对比结果三段渲染：仅 A 有 / 仅 B 有 / 字段变更（逐路由折叠 + 字段表）', async () => {
    makeEnvAvailable(['default', 'staging'])
    mocks.getEnvironmentDiff.mockResolvedValue(makeDiffResult())
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tab = 'diff'
    await wrapper.vm.$nextTick()
    vm.diffFrom = 'default'
    vm.diffTo = 'staging'
    await vm.runEnvDiff()
    expect(vm.diffState).toBe('ok')
    expect(vm.diffOnlyFromLabels).toEqual(['only-a', 'only-obj'])
    expect(vm.diffOnlyToLabels).toEqual(['only-b'])
    // 三段容器都在
    expect(wrapper.find('[data-testid="env-diff-only-from"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-diff-only-to"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-diff-changed"]').exists()).toBe(true)
    // changed 逐路由折叠面板（2 条）+ 字段级行（changed-1 有 2 个字段）
    expect(vm.diffFieldRows(vm.diffResult.changed[0]).length).toBe(2)
    expect(vm.diffFieldRows(vm.diffResult.changed[0])[0]).toEqual({ field: 'path', from: '/a', to: '/b' })
    expect(wrapper.findAll('.collapse-item-stub').length).toBe(2)
  })

  it('两环境一致 → 字段变更段显示「两环境路由配置一致」空态', async () => {
    makeEnvAvailable(['default', 'staging'])
    mocks.getEnvironmentDiff.mockResolvedValue({ from: 'default', to: 'staging', only_in_from: [], only_in_to: [], changed: [] })
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tab = 'diff'
    await wrapper.vm.$nextTick()
    vm.diffFrom = 'default'
    vm.diffTo = 'staging'
    await vm.runEnvDiff()
    expect(wrapper.find('[data-testid="env-diff-no-changes"]').exists()).toBe(true)
  })

  it('diff 接口 404 / 失败 → 空态 +「环境对比服务不可用」', async () => {
    makeEnvAvailable(['default', 'staging'])
    mocks.getEnvironmentDiff.mockRejectedValue(new Error('Request failed with status 404'))
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tab = 'diff'
    await wrapper.vm.$nextTick()
    vm.diffFrom = 'default'
    vm.diffTo = 'staging'
    await vm.runEnvDiff()
    expect(vm.diffState).toBe('unavailable')
    expect(wrapper.find('[data-testid="env-diff-unavailable"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('环境对比服务不可用')
  })

  it('from === to 或未选全 → 对比按钮禁用、不发请求', async () => {
    makeEnvAvailable(['default', 'staging'])
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    // 默认已自动选好两个不同环境 → 可对比
    expect(vm.diffInputsOk).toBe(true)
    // 清空 to / 或 from===to → 不可对比且不发请求
    vm.diffTo = ''
    expect(vm.diffInputsOk).toBe(false)
    await vm.runEnvDiff()
    expect(mocks.getEnvironmentDiff).not.toHaveBeenCalled()
    vm.diffTo = 'default'
    expect(vm.diffInputsOk).toBe(false)
  })

  it('环境功能降级（/v1/environments 404）→ 进入 Tab 直接空态「环境对比服务不可用」', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.tab = 'diff'
    await wrapper.vm.$nextTick()
    expect(vm.envReady).toBe(false)
    expect(wrapper.find('[data-testid="env-diff-unavailable"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('环境对比服务不可用')
    // 选择器不渲染（无环境可选）
    expect(wrapper.find('[data-testid="env-diff-from"]').exists()).toBe(false)
  })
})
