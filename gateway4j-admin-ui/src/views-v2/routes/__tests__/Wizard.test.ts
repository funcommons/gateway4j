/**
 * S4-T：v2 新建路由向导测试（契约 §1 V2RouteWizard /v2/routes/wizard permission route:edit + §4 S4；
 * 视觉参照 prototype-v2/03-route-wizard.html）。先红是预期：页面由 S4-C 实现（当前为占位页）。
 * 数据契约（S4-C 按此实现，字段名以 src/api/routes.ts createRoute 真实签名为准，不是猜的）：
 *   route_name 必填（第 2 步，沿用 RouteBasicForm ^[a-zA-Z0-9_]{2,50}$）；route_type 'BACKEND'|'DISPATCH'
 *   （basic/copy→BACKEND；dispatch/canary→DISPATCH）；path 必填（^\/[^\s]+$）；upstream_url BACKEND 必填
 *   （^https?:\/\/\S+$）、DISPATCH 不传；plugin_ids: string[]（第 4 步勾选；带 binding_config 的 bindings 留
 *   编辑器）；environment 可选，向导 v1 不带，本文件不断言。插件数据源 = listPlugins({ page:1, pageSize:100 })
 *   （@/api/plugins → Page<PluginItem>），chips 仅列 scope='ROUTE' 且 status='ENABLED'。
 *   成功 = toast.success + 跳转 /v2/routes；失败 = 停留当前步 + wizard-error 显示 e.message，可重试。
 *   草稿 = sessionStorage 'v2-wizard-draft'（wizard-draft 手动保存；mount 自动恢复），JSON 形如
 *   { step, template, form: { route_name, path, upstream_url, plugins } }（form 字段名与 payload 一致）。
 * 后端能力缺口（核实 src/api/routes.ts，非猜测）：createRoute 单次只建一条路由、无 branches/多分支字段，
 *   DISPATCH「分支」= conditions（target_route_id 须指向已存在路由）→ v1 向导对分发/灰度模板仅建 DISPATCH
 *   父路由（第 3 步「分支配置」简化形态=首分支），多分支留 S5a，本文件不对多分支数量/UI 断言；灰度模板
 *   后端无专用字段，只断言卡片渲染。
 * 提示词 → 真实字段对照：name → route_name；matchPath → path；upstreamUrl → upstream_url；「多分支创建」
 *   → 无此能力（见上）；plugins → plugin_ids | bindings，向导取前者；旧建页是 src/views/routes/Editor.vue
 *   （提示词里的 RouteNew.vue 不存在）：语义 = route_name/path/upstream_url 必填 + 成功 toast + 跳详情；
 *   v2 向导按契约跳 /v2/routes。
 * 依赖 i18n key 全表（v2.wizard.*，zh/en 同步加，铁律 6；S4-C 落 key 后 it.each 转绿）：
 *   stepTemplate stepMatch stepTarget stepPlugins stepPublish；tplBasic tplDispatch tplCanary tplCopy tplBlank；
 *   prev next submit saveDraft draftSaved draftRestored；labelName labelPath labelUpstream；
 *   nameRequired pathRequired upstreamRequired upstreamFormat；pluginsInheritGlobal；
 *   summaryTitle summaryTemplate summaryPath summaryUpstream summaryPlugins；branchTitle branchFirst；
 *   createFailed forbidden
 * DOM 契约（data-testid 全表）：wizard-step-<1..5>（当前步 aria-current="step"）；wizard-template-<basic|
 *   dispatch|canary|copy|blank>；wizard-next / wizard-prev / wizard-submit / wizard-draft；wizard-step-error
 *   （当前步校验错误条）；wizard-error（创建失败错误条）；route-name / route-path / route-upstream（input 元素
 *   本体）；wizard-plugin-<plugin_id>（chip，选中 aria-pressed="true"）；wizard-branch（DISPATCH 第 3 步分支区）；
 *   wizard-summary（发布步汇总）；wizard-forbidden（无权限整页态）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import { MemoryStorage } from '@/test-utils/memory-storage'

const mocks = vi.hoisted(() => ({
  createRoute: vi.fn(),
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  duplicateRoute: vi.fn(),
  listPlugins: vi.fn(),
  listGlobalPlugins: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  createRoute: mocks.createRoute,
  listRoutes: mocks.listRoutes,
  getRoute: mocks.getRoute,
  duplicateRoute: mocks.duplicateRoute
}))
vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  listGlobalPlugins: mocks.listGlobalPlugins
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// 只替换 toast；Fc* 组件保留真实实现（v2 页面统一从 '@/components' barrel 取组件 + toast）
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})

import Wizard from '@/views-v2/routes/Wizard.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
// dig: 按点路径取 locale 值；undefined = key 缺失（沿 S3-T 惯例）
const dig = (obj: unknown, dotPath: string) => dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
const t = (key: string) => String(dig(zhCN, key))

// 3 个 ROUTE+ENABLED 可选；GLOBAL（继承不进 chips）与 DISABLED（不进 chips）各 1 个用于过滤断言
const plug = (pid: string, name: string, scope = 'ROUTE', status = 'ENABLED', phase = 'PRE') =>
  ({ id: pid, plugin_id: pid, plugin_name: name, plugin_type: 'BUILTIN', plugin_phase: phase, scope, status, sort_order: 0, config: '{}' })
const ROUTE_PLUGINS = [plug('p0', '签名校验'), plug('p1', '请求限流'), plug('p2', '链路追踪', 'ROUTE', 'ENABLED', 'POST'), plug('g0', '全局幂等', 'GLOBAL'), plug('p9', '停用插件', 'ROUTE', 'DISABLED')]

// 本仓库 vitest jsdom 不暴露 storage（沿 List.stream-refresh 惯例装替身）
function installStorage() {
  const s = new MemoryStorage()
  for (const g of [globalThis, window]) Object.defineProperty(g, 'sessionStorage', { configurable: true, value: s })
  return s
}

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/wizard', component: Wizard as any },
      { path: '/v2/routes', component: { template: '<div />' } }
    ]
  })
  await router.push('/v2/routes/wizard')
  await router.isReady()
  const wrapper = mount(Wizard, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const stepEl = (w: VueWrapper<any>, n: number) => w.find(`[data-testid="wizard-step-${n}"]`)
const currentStep = (w: VueWrapper<any>) =>
  [1, 2, 3, 4, 5].find((n) => stepEl(w, n).attributes('aria-current') === 'step')
const inputVal = (w: VueWrapper<any>, id: string) =>
  (w.find(`input[data-testid="${id}"]`).element as HTMLInputElement).value

async function selectTemplate(w: VueWrapper<any>, id = 'basic') {
  await w.find(`[data-testid="wizard-template-${id}"]`).trigger('click')
  await flushPromises()
  await w.find('[data-testid="wizard-next"]').trigger('click')
  await flushPromises()
}
const setInput = async (w: VueWrapper<any>, id: string, v: string) => {
  await w.find(`input[data-testid="${id}"]`).setValue(v)
}
async function clickNext(w: VueWrapper<any>) {
  await w.find('[data-testid="wizard-next"]').trigger('click')
  await flushPromises()
}
// 进入第 3 步（basic/BACKEND）：name+path 已填；upstream 不填（由用例自控）
async function gotoStep3(w: VueWrapper<any>, opts: { upstream?: string } = {}) {
  await selectTemplate(w)
  await setInput(w, 'route-name', 'user_service')
  await setInput(w, 'route-path', '/api/x/**')
  await clickNext(w)
  if (opts.upstream !== undefined) await setInput(w, 'route-upstream', opts.upstream)
}
// 进入第 5 步：合法 upstream + 勾选 p0/p1
async function gotoStep5(w: VueWrapper<any>) {
  await gotoStep3(w, { upstream: 'http://demo:8080' })
  await clickNext(w)
  await w.find('[data-testid="wizard-plugin-p0"]').trigger('click'); await flushPromises()
  await w.find('[data-testid="wizard-plugin-p1"]').trigger('click'); await flushPromises()
  await clickNext(w)
}

beforeEach(() => {
  setActivePinia(createPinia())
  installStorage()
  mocks.createRoute.mockReset().mockResolvedValue({ id: 'new-1', route_name: 'user_service', route_type: 'BACKEND', status: 'DRAFT' })
  mocks.listRoutes.mockReset().mockResolvedValue([])
  mocks.listPlugins.mockReset().mockResolvedValue({ records: ROUTE_PLUGINS, total: ROUTE_PLUGINS.length, size: 100, current: 1, pages: 1 })
  mocks.listGlobalPlugins.mockReset().mockResolvedValue([])
  Object.values(mocks.toast).forEach((fn) => (fn as any).mockClear())
  mocks.canEdit.mockReturnValue(true)
})

const KEYS = ['stepTemplate', 'stepMatch', 'stepTarget', 'stepPlugins', 'stepPublish', 'tplBasic', 'tplDispatch',
  'tplCanary', 'tplCopy', 'tplBlank', 'prev', 'next', 'submit', 'saveDraft', 'draftSaved', 'draftRestored',
  'labelName', 'labelPath', 'labelUpstream', 'nameRequired', 'pathRequired', 'upstreamRequired', 'upstreamFormat',
  'pluginsInheritGlobal', 'summaryTitle', 'summaryTemplate', 'summaryPath', 'summaryUpstream', 'summaryPlugins',
  'branchTitle', 'branchFirst', 'createFailed', 'forbidden'].map((k) => `v2.wizard.${k}`)

describe('v2 routes/Wizard — i18n key 全表双语存在（铁律 6）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 routes/Wizard — 步骤条与模板卡', () => {
  it('渲染五步、初始第 1 步；未选模板时上一步/下一步 disabled', async () => {
    const { wrapper } = await factory()
    for (let n = 1; n <= 5; n++) expect(stepEl(wrapper, n).exists()).toBe(true)
    expect(currentStep(wrapper)).toBe(1)
    expect(wrapper.find('[data-testid="wizard-prev"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="wizard-next"]').attributes('disabled')).toBeDefined()
  })

  it('渲染 4 张模板卡 + 空白自建，卡上显示模板名', async () => {
    const { wrapper } = await factory()
    const cards: Array<[string, string]> = [
      ['basic', 'v2.wizard.tplBasic'], ['dispatch', 'v2.wizard.tplDispatch'], ['canary', 'v2.wizard.tplCanary'],
      ['copy', 'v2.wizard.tplCopy'], ['blank', 'v2.wizard.tplBlank']
    ]
    for (const [id, key] of cards) {
      const card = wrapper.find(`[data-testid="wizard-template-${id}"]`)
      expect(card.exists(), `缺模板卡 ${id}`).toBe(true)
      expect(card.text()).toContain(t(key))
    }
  })

  it('选「单服务转发」→ 下一步点亮 → 进入第 2 步匹配条件表单（route-name/route-path）', async () => {
    const { wrapper } = await factory()
    await wrapper.find('[data-testid="wizard-template-basic"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wizard-next"]').attributes('disabled')).toBeUndefined()
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(2)
    expect(wrapper.find('input[data-testid="route-path"]').exists()).toBe(true)
    expect(wrapper.find('input[data-testid="route-name"]').exists()).toBe(true)
  })
})

describe('v2 routes/Wizard — 匹配条件校验（沿用 RouteBasicForm 语义）', () => {
  it('空表单阻断提示 nameRequired；填名称后空路径阻断提示 pathRequired；填 path 可进第 3 步', async () => {
    const { wrapper } = await factory()
    await selectTemplate(wrapper)
    await clickNext(wrapper)
    expect(wrapper.find('[data-testid="wizard-step-error"]').text()).toContain(t('v2.wizard.nameRequired'))
    expect(currentStep(wrapper)).toBe(2)
    await setInput(wrapper, 'route-name', 'user_service')
    await clickNext(wrapper)
    expect(wrapper.find('[data-testid="wizard-step-error"]').text()).toContain(t('v2.wizard.pathRequired'))
    expect(currentStep(wrapper)).toBe(2)
    await setInput(wrapper, 'route-path', '/api/x/**')
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(3)
  })
})

describe('v2 routes/Wizard — 转发目标（第 3 步）', () => {
  it('上游必填 + http(s):// 前缀格式校验（无 scheme / ftp 前缀均阻断），合法后进第 4 步', async () => {
    const { wrapper } = await factory()
    await gotoStep3(wrapper)
    await clickNext(wrapper)
    expect(wrapper.find('[data-testid="wizard-step-error"]').text()).toContain(t('v2.wizard.upstreamRequired'))
    expect(currentStep(wrapper)).toBe(3)
    await setInput(wrapper, 'route-upstream', 'demo:8080')
    await clickNext(wrapper)
    expect(wrapper.find('[data-testid="wizard-step-error"]').text()).toContain(t('v2.wizard.upstreamFormat'))
    await setInput(wrapper, 'route-upstream', 'ftp://demo:8080')
    await clickNext(wrapper)
    expect(wrapper.find('[data-testid="wizard-step-error"]').text()).toContain(t('v2.wizard.upstreamFormat'))
    await setInput(wrapper, 'route-upstream', 'http://demo:8080')
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(4)
  })

  // 后端 createRoute 无多分支字段（见文件头能力缺口）：v1 仅单分支形态，多分支留 S5a，不做数量断言
  it('分发模板：第 3 步为分支配置简化形态（无上游输入），可进插件步', async () => {
    const { wrapper } = await factory()
    await selectTemplate(wrapper, 'dispatch')
    await setInput(wrapper, 'route-name', 'vip_dispatch')
    await setInput(wrapper, 'route-path', '/api/vip/**')
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(3)
    const branch = wrapper.find('[data-testid="wizard-branch"]')
    expect(branch.exists()).toBe(true)
    expect(branch.text()).toContain(t('v2.wizard.branchTitle'))
    expect(branch.text()).toContain(t('v2.wizard.branchFirst'))
    expect(wrapper.find('input[data-testid="route-upstream"]').exists()).toBe(false)
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(4)
  })
})

describe('v2 routes/Wizard — 插件链（第 4 步）', () => {
  it('listPlugins 数据渲染 ROUTE/ENABLED chips；GLOBAL/停用不进列表；显示默认继承全局提示', async () => {
    const { wrapper } = await factory()
    expect(mocks.listPlugins).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100 }))
    await gotoStep3(wrapper, { upstream: 'http://demo:8080' })
    await clickNext(wrapper)
    for (const pid of ['p0', 'p1', 'p2']) {
      expect(wrapper.find(`[data-testid="wizard-plugin-${pid}"]`).exists(), `缺插件 chip ${pid}`).toBe(true)
    }
    expect(wrapper.find('[data-testid="wizard-plugin-g0"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-plugin-p9"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(t('v2.wizard.pluginsInheritGlobal'))
  })

  it('chip 可勾选（aria-pressed 翻转）且整步可跳过：不选任何插件直接进发布步', async () => {
    const { wrapper } = await factory()
    await gotoStep3(wrapper, { upstream: 'http://demo:8080' })
    await clickNext(wrapper)
    const chip = () => wrapper.find('[data-testid="wizard-plugin-p0"]')
    expect(chip().attributes('aria-pressed')).toBe('false')
    await chip().trigger('click')
    await flushPromises()
    expect(chip().attributes('aria-pressed')).toBe('true')
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(5)
    // 跳过形态：重开一局，不勾任何 chip
    const { wrapper: w2 } = await factory()
    await gotoStep3(w2, { upstream: 'http://demo:8080' })
    await clickNext(w2)
    await clickNext(w2)
    expect(currentStep(w2)).toBe(5)
  })
})

describe('v2 routes/Wizard — 发布步汇总与创建', () => {
  it('汇总摘要含模板/路径/上游/插件数；完成创建调 createRoute（payload 对齐真实契约）→ toast + 跳 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    await gotoStep5(wrapper)
    const text = wrapper.find('[data-testid="wizard-summary"]').text()
    expect(text).toContain(t('v2.wizard.tplBasic'))
    expect(text).toContain('/api/x/**')
    expect(text).toContain('http://demo:8080')
    expect(text).toContain(t('v2.wizard.summaryPlugins'))
    expect(text).toContain('2')
    await wrapper.find('[data-testid="wizard-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.createRoute).toHaveBeenCalledTimes(1)
    const body = mocks.createRoute.mock.calls[0][0] as Record<string, unknown>
    expect(body).toMatchObject({
      route_name: 'user_service', route_type: 'BACKEND', path: '/api/x/**',
      upstream_url: 'http://demo:8080', plugin_ids: ['p0', 'p1']
    })
    expect(mocks.toast.success).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })
})

describe('v2 routes/Wizard — 创建失败可重试', () => {
  it('createRoute reject → wizard-error 显示 e.message、停留第 5 步、再次提交走成功路径', async () => {
    const { wrapper, router } = await factory()
    await gotoStep5(wrapper)
    mocks.createRoute.mockRejectedValueOnce(new Error('backend exploded'))
    await wrapper.find('[data-testid="wizard-submit"]').trigger('click')
    await flushPromises()
    const err = wrapper.find('[data-testid="wizard-error"]')
    expect(err.text()).toContain('backend exploded')
    expect(err.text()).toContain(t('v2.wizard.createFailed'))
    expect(currentStep(wrapper)).toBe(5)
    expect(wrapper.find('[data-testid="wizard-submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-testid="wizard-submit"]').trigger('click')
    await flushPromises()
    expect(mocks.toast.success).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })
})

describe('v2 routes/Wizard — 保存草稿与恢复', () => {
  it('保存草稿 → sessionStorage 落 v2-wizard-draft（step+template+表单值）；重新 mount 恢复到上次步骤与值', async () => {
    const { wrapper } = await factory()
    await gotoStep3(wrapper, { upstream: 'http://demo:8080' })
    await wrapper.find('[data-testid="wizard-draft"]').trigger('click')
    await flushPromises()
    const raw = window.sessionStorage.getItem('v2-wizard-draft')
    expect(raw, '草稿未写入 sessionStorage').toBeTruthy()
    const draft = JSON.parse(raw as string)
    expect(draft).toMatchObject({ step: 3, template: 'basic', form: { route_name: 'user_service', path: '/api/x/**', upstream_url: 'http://demo:8080' } })
    // 「刷新恢复」：同一 sessionStorage 上重新 mount，回到上次步骤+已填值
    // 单步渲染：五步互斥 v-if/v-else-if，step 3 只挂 route-upstream；name/path 需 wizard-prev 回 step 2 后断言
    const { wrapper: w2 } = await factory()
    expect(currentStep(w2)).toBe(3)
    expect(w2.find('input[data-testid="route-upstream"]').exists()).toBe(true)
    expect(inputVal(w2, 'route-upstream')).toBe('http://demo:8080')
    await w2.find('[data-testid="wizard-prev"]').trigger('click')
    await flushPromises()
    expect(inputVal(w2, 'route-name')).toBe('user_service')
    expect(inputVal(w2, 'route-path')).toBe('/api/x/**')
  })
})

describe('v2 routes/Wizard — 权限', () => {
  it("canEdit('route')=false → 整页无权限态，不渲染步骤条与表单", async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(wrapper.find('[data-testid="wizard-forbidden"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wizard-forbidden"]').text()).toContain(t('v2.wizard.forbidden'))
    expect(stepEl(wrapper, 1).exists()).toBe(false)
    expect(wrapper.find('input[data-testid="route-path"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-next"]').exists()).toBe(false)
  })
})

describe('v2 routes/Wizard — 上一步导航', () => {
  it('上一步回退且指示器高亮跟随，已填值保留', async () => {
    const { wrapper } = await factory()
    await gotoStep3(wrapper, { upstream: 'http://demo:8080' })
    expect(currentStep(wrapper)).toBe(3)
    await wrapper.find('[data-testid="wizard-prev"]').trigger('click')
    await flushPromises()
    expect(currentStep(wrapper)).toBe(2)
    expect(stepEl(wrapper, 3).attributes('aria-current')).toBeUndefined()
    expect(inputVal(wrapper, 'route-path')).toBe('/api/x/**')
    await clickNext(wrapper)
    expect(currentStep(wrapper)).toBe(3)
  })
})
