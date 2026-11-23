/**
 * S12-7c-T：v2 路由创建单页「纯 SCG 路由列表编辑器」+ SCG RouteDefinition YAML 视图测试。
 * （先红，RED 留原文。替代旧 IngressForm.test.ts —— K8s Ingress 形态随本票下线。）
 *
 * 用户裁决（2026-11-23）：「路由创建要 100% Spring Cloud Gateway 对齐」「不要向导」
 * 「要 spring gateway 1:1 对应填写」「表单主体=纯 SCG 路由列表编辑器」「YAML 输出
 * SCG RouteDefinition YAML（可粘回 SCG 配置用）」。
 * 后端契约：POST /v1/routes/batch（S12-7b）—— routes[] 每项
 * { name, uri, predicates[], filters[], order, metadata, environment, remark, tags }；
 * 响应 data.created[]{route_id,route_name,uri,path,predicates_count,filters_count}；
 * 错误：10100 结构校验（message 中文带格式提示）/ 10609 重名 / 10605 落库失败；
 * 创建后 status=DRAFT 需另行发布（成功提示必须含 DRAFT 引导 + 跳路由列表）。
 *
 * ══ 页面契约（T 固化，C 不得偏离）══
 * 落点：src/views-v2/routes/ScgRoutesForm.vue（单页）。
 * 路由：/v2/routes/new（入口路径不变，E2E 03-06 依赖），name=V2RouteScg，
 *       permission=route:edit，meta.title=v2.page.routeScg。
 * 主体：SCG 路由列表（多条，每条 = SCG RouteDefinition 字段 name/uri/predicates[]/
 *       filters[]/order/metadata），谓词与过滤器行可增删重排（顺序即 sort_order/执行顺序）；
 *       全局 environment（缺省 default）/remark/tags 应用于本批全部路由。
 * 提交：POST /v1/routes/batch（@/api/routes createRoutesBatch）。
 * 双视图：表单 ⇄ YAML（SCG RouteDefinition YAML，双向解析；失败行内报错不切回）。
 * 旧 K8s Ingress 形态下线：IngressForm.vue / ingressModel.ts / ingressYaml.ts 删除，
 *   router/侧栏/命令面板不再引用 IngressForm 与 v2.nav.ingress / v2.page.ingress /
 *   v2.ingress.*；旧向导 v2.nav.wizard key 保留（旧向导页面还在）。
 *
 * ══ i18n key 全表（v2.scg.*，zh-CN/en-US 同步加，铁律 6）══
 * title sectionGlobal sectionRoutes fieldName fieldUri uriPlaceholder fieldOrder
 * fieldPredicates fieldFilters fieldMetadata metadataPlaceholder predOrderHint orderHint
 * addRoute removeRoute addPredicate removePredicate addFilter removeFilter moveUp moveDown
 * fieldEnvironment fieldRemark fieldTags
 * viewForm viewYaml viewLabel viewToggle switchToForm switchToYaml yamlHint
 * create cancel createSuccess draftGuide gotoList createFailed forbidden
 * nameRequired nameInvalid uriRequired uriInvalid orderInvalid metadataInvalid
 * pathMulti pathMultiPattern pathInvalid pathEmpty dupName defTooLong envInvalid yamlInvalid
 * 另：v2.nav.routeScg / v2.page.routeScg（替代 v2.nav.ingress / v2.page.ingress）。
 *
 * ══ DOM 契约（data-testid，前缀 scg-）══
 * scg-root / scg-forbidden
 * scg-view-form / scg-view-yaml（双视图切换钮，aria-pressed 同步当前视图）
 * scg-yaml-hint / scg-form-view / scg-yaml-view / scg-yaml / scg-yaml-error
 * scg-environment / scg-remark / scg-tags（全局批次字段）
 * scg-add-route / scg-route-<i> / scg-name-<i> / scg-uri-<i> / scg-order-<i>
 * scg-metadata-<i> / scg-rm-route-<i>
 * scg-add-pred-<i> / scg-pred-<i>-<j> / scg-rm-pred-<i>-<j> / scg-pred-up-<i>-<j> / scg-pred-down-<i>-<j>
 * scg-add-filter-<i> / scg-filter-<i>-<j> / scg-rm-filter-<i>-<j> / scg-filter-up-<i>-<j> / scg-filter-down-<i>-<j>
 * scg-error（校验错误条）/ scg-submit-error（提交失败错误条）/ scg-success（DRAFT 引导条）
 * scg-goto-list（成功引导「前往路由列表发布」）/ scg-submit / scg-cancel
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  createRoutesBatch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  createRoutesBatch: mocks.createRoutesBatch
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// 只替换 toast；Fc* 组件保留真实实现
vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components')>()
  return { ...actual, toast: mocks.toast }
})
// YAML 编辑器替身：FcYamlEditor 本体行为由其专属套件覆盖（FcCodeEditor.test.ts 同款分层），
// 本页只关心「YAML 文本 ⇄ 表单」双向同步链路。
vi.mock('@/components-v2/editor/FcYamlEditor.vue', () => ({
  default: {
    name: 'FcYamlEditor',
    props: ['modelValue', 'disabled', 'maxlength', 'rows'],
    emits: ['update:modelValue'],
    template: `<textarea data-testid="yde-content" :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"></textarea>`
  }
}))

// —— 变量路径动态导入（组件缺失 → 运行时模块解析失败 = 合法 RED，文件收集不炸；
//     与 scgModel.test.ts / 旧 IngressForm.test.ts 同法）——
const FORM_PATH = '@/views-v2/routes/ScgRoutesForm.vue'
async function loadForm(): Promise<any> {
  try {
    const mod = await import(FORM_PATH)
    return mod.default
  } catch {
    return null
  }
}

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const Form = await loadForm()
  expect(Form, 'ScgRoutesForm.vue 组件缺失（RED 预期）').toBeTruthy()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/new', component: Form as any },
      { path: '/v2/routes', component: stub }
    ]
  })
  await router.push('/v2/routes/new')
  await router.isReady()
  const wrapper = mount(Form, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const tid = (w: VueWrapper<any>, id: string) => w.find(`[data-testid="${id}"]`)
/** 输入位可能是 <input>（FcInput 默认）或 <textarea>（FcInput type=textarea） */
const inputEl = (w: VueWrapper<any>, id: string) => {
  const el = w.find(`input[data-testid="${id}"]`)
  return el.exists() ? el : w.find(`textarea[data-testid="${id}"]`)
}
const inputVal = (w: VueWrapper<any>, id: string) => (inputEl(w, id).element as HTMLInputElement).value

async function setInput(w: VueWrapper<any>, id: string, value: string) {
  await inputEl(w, id).setValue(value)
}

/** 填一份最小可用表单（name/uri 齐，谓词带 Path=） */
async function fillValid(w: VueWrapper<any>) {
  await setInput(w, 'scg-name-0', 'api_gateway')
  await setInput(w, 'scg-uri-0', 'http://user-service:8080')
  await tid(w, 'scg-add-pred-0').trigger('click')
  await setInput(w, 'scg-pred-0-0', 'Path=/api/**')
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.createRoutesBatch.mockReset().mockResolvedValue({
    created: [{ route_id: '1', route_name: 'api_gateway', uri: 'http://user-service:8080', path: '/api/**', predicates_count: 1, filters_count: 0 }]
  })
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.canEdit.mockReturnValue(true)
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'title', 'sectionGlobal', 'sectionRoutes',
  'fieldName', 'fieldUri', 'uriPlaceholder', 'fieldOrder', 'fieldPredicates', 'fieldFilters',
  'fieldMetadata', 'metadataPlaceholder', 'predOrderHint', 'orderHint',
  'addRoute', 'removeRoute', 'addPredicate', 'removePredicate', 'addFilter', 'removeFilter',
  'moveUp', 'moveDown',
  'fieldEnvironment', 'fieldRemark', 'fieldTags',
  'viewForm', 'viewYaml', 'viewLabel', 'viewToggle', 'switchToForm', 'switchToYaml', 'yamlHint',
  'create', 'cancel', 'createSuccess', 'draftGuide', 'gotoList', 'createFailed', 'forbidden',
  'nameRequired', 'nameInvalid', 'uriRequired', 'uriInvalid', 'orderInvalid', 'metadataInvalid',
  'pathMulti', 'pathMultiPattern', 'pathInvalid', 'pathEmpty', 'dupName', 'defTooLong',
  'envInvalid', 'yamlInvalid'
].map((k) => `v2.scg.${k}`)

describe('S12-7c — i18n key 全表双语存在（铁律 6，v2.scg.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })

  it('导航/页面 key：v2.nav.routeScg 与 v2.page.routeScg 双语存在；旧 ingress key 清零', () => {
    for (const key of ['v2.nav.routeScg', 'v2.page.routeScg']) {
      expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
      expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
    }
    for (const key of ['v2.nav.ingress', 'v2.page.ingress', 'v2.ingress']) {
      expect(dig(zhCN, key), `旧 key ${key} 必须清理`).toBeUndefined()
      expect(dig(enUS, key), `旧 key ${key} 必须清理`).toBeUndefined()
    }
    // 旧向导 key 保留（旧向导页面还在）
    expect(dig(zhCN, 'v2.nav.wizard')).toBeDefined()
    expect(dig(enUS, 'v2.nav.wizard')).toBeDefined()
  })
})

// ── 结构渲染与行操作 ──────────────────────────────────────────────────────
describe('S12-7c — 结构：SCG 路由列表渲染与增删', () => {
  it('默认渲染一条路由（name/uri/order/metadata + 谓词与过滤器空编辑区）', async () => {
    const { wrapper } = await factory()
    expect(tid(wrapper, 'scg-root').exists()).toBe(true)
    expect(tid(wrapper, 'scg-form-view').exists()).toBe(true)
    expect(tid(wrapper, 'scg-route-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-name-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-uri-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-order-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-metadata-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-add-pred-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-add-filter-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-add-route').exists()).toBe(true)
    expect(tid(wrapper, 'scg-submit').exists()).toBe(true)
    expect(tid(wrapper, 'scg-cancel').exists()).toBe(true)
    // 全局批次字段
    expect(tid(wrapper, 'scg-environment').exists()).toBe(true)
    expect(tid(wrapper, 'scg-remark').exists()).toBe(true)
    expect(tid(wrapper, 'scg-tags').exists()).toBe(true)
    // uri 占位提示 http://host:port（票面裁决）
    expect(inputEl(wrapper, 'scg-uri-0').attributes('placeholder')).toContain('http://host:port')
  })

  it('添加路由 → 新路由行渲染；删除路由 → 行消失；删到最后一行回落一条空行', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'scg-add-route').trigger('click')
    expect(tid(wrapper, 'scg-route-1').exists()).toBe(true)
    expect(tid(wrapper, 'scg-name-1').exists()).toBe(true)
    await tid(wrapper, 'scg-rm-route-1').trigger('click')
    expect(tid(wrapper, 'scg-route-1').exists()).toBe(false)
    await tid(wrapper, 'scg-rm-route-0').trigger('click')
    expect(tid(wrapper, 'scg-route-0').exists(), '删到最后一行必须回落一条空行').toBe(true)
    expect(inputVal(wrapper, 'scg-name-0')).toBe('')
  })

  it('谓词行可增删；过滤器行可增删', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    expect(tid(wrapper, 'scg-pred-0-0').exists()).toBe(true)
    expect(tid(wrapper, 'scg-pred-0-1').exists()).toBe(true)
    await setInput(wrapper, 'scg-pred-0-0', 'Path=/api/**')
    await setInput(wrapper, 'scg-pred-0-1', 'Host=api.example.com')
    await tid(wrapper, 'scg-rm-pred-0-1').trigger('click')
    expect(tid(wrapper, 'scg-pred-0-1').exists()).toBe(false)

    await tid(wrapper, 'scg-add-filter-0').trigger('click')
    expect(tid(wrapper, 'scg-filter-0-0').exists()).toBe(true)
    await setInput(wrapper, 'scg-filter-0-0', 'AddRequestHeader=X-Foo, bar')
    await tid(wrapper, 'scg-rm-filter-0-0').trigger('click')
    expect(tid(wrapper, 'scg-filter-0-0').exists()).toBe(false)
  })

  it('谓词/过滤器行可重排（上移/下移），行顺序即提交顺序（sort_order）', async () => {
    const { wrapper } = await factory()
    await setInput(wrapper, 'scg-name-0', 'api_gateway')
    await setInput(wrapper, 'scg-uri-0', 'http://user-service:8080')
    // 谓词两行：Path 在前、Host 在后
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    await setInput(wrapper, 'scg-pred-0-0', 'Path=/api/**')
    await setInput(wrapper, 'scg-pred-0-1', 'Host=api.example.com')
    // 过滤器两行
    await tid(wrapper, 'scg-add-filter-0').trigger('click')
    await tid(wrapper, 'scg-add-filter-0').trigger('click')
    await setInput(wrapper, 'scg-filter-0-0', 'StripPrefix=1')
    await setInput(wrapper, 'scg-filter-0-1', 'AddRequestHeader=X-Foo, bar')
    // Host 上移 → 谓词顺序变为 Host, Path
    await tid(wrapper, 'scg-pred-up-0-1').trigger('click')
    // StripPrefix 下移 → 过滤器顺序变为 AddRequestHeader, StripPrefix
    await tid(wrapper, 'scg-filter-down-0-0').trigger('click')

    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    const payload = mocks.createRoutesBatch.mock.calls[0][0]
    expect(payload.routes[0].predicates).toStrictEqual(['Host=api.example.com', 'Path=/api/**'])
    expect(payload.routes[0].filters).toStrictEqual(['AddRequestHeader=X-Foo, bar', 'StripPrefix=1'])

    // 再排回去：谓词把第 1 行（Host）下移还原；过滤器把第 2 行（StripPrefix）上移还原
    await tid(wrapper, 'scg-pred-down-0-0').trigger('click')
    await tid(wrapper, 'scg-filter-up-0-1').trigger('click')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    const payload2 = mocks.createRoutesBatch.mock.calls[1][0]
    expect(payload2.routes[0].predicates).toStrictEqual(['Path=/api/**', 'Host=api.example.com'])
    expect(payload2.routes[0].filters).toStrictEqual(['StripPrefix=1', 'AddRequestHeader=X-Foo, bar'])
  })
})

// ── 载荷形状 ──────────────────────────────────────────────────────────────
describe('S12-7c — 载荷：POST /v1/routes/batch（SCG RouteDefinition 1:1）', () => {
  it('payload 逐字一致（全局 env/remark/tags 逐条携带；metadata parse 成对象；order 数值）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    await setInput(wrapper, 'scg-pred-0-1', 'Host=api.example.com')
    await tid(wrapper, 'scg-add-filter-0').trigger('click')
    await setInput(wrapper, 'scg-filter-0-0', 'AddRequestHeader=X-Foo, bar')
    await setInput(wrapper, 'scg-order-0', '2')
    await setInput(wrapper, 'scg-metadata-0', '{"team":"core"}')
    await setInput(wrapper, 'scg-environment', 'prod')
    await setInput(wrapper, 'scg-remark', 'demo')
    await setInput(wrapper, 'scg-tags', 'core,api')

    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()

    expect(mocks.createRoutesBatch).toHaveBeenCalledTimes(1)
    expect(mocks.createRoutesBatch.mock.calls[0][0]).toStrictEqual({
      routes: [
        {
          name: 'api_gateway',
          uri: 'http://user-service:8080',
          predicates: ['Path=/api/**', 'Host=api.example.com'],
          filters: ['AddRequestHeader=X-Foo, bar'],
          order: 2,
          metadata: { team: 'core' },
          environment: 'prod',
          remark: 'demo',
          tags: 'core,api'
        }
      ]
    })
  })

  it('多路由批量：第二条路由独立成项，全局字段逐条应用', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-environment', 'prod')
    await tid(wrapper, 'scg-add-route').trigger('click')
    await setInput(wrapper, 'scg-name-1', 'order_route')
    await setInput(wrapper, 'scg-uri-1', 'http://order-service:9090')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    const payload = mocks.createRoutesBatch.mock.calls[0][0]
    expect(payload.routes.length).toBe(2)
    expect(payload.routes[1]).toMatchObject({ name: 'order_route', uri: 'http://order-service:9090', environment: 'prod' })
    expect(payload.routes[0].environment).toBe('prod')
  })

  it('order 填非整数 → 校验 orderInvalid 且不调 API；负整数合法', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-order-0', 'abc')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.orderInvalid'))
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()

    await setInput(wrapper, 'scg-order-0', '-3')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(mocks.createRoutesBatch).toHaveBeenCalledTimes(1)
    expect(mocks.createRoutesBatch.mock.calls[0][0].routes[0].order).toBe(-3)
  })
})

// ── 校验（与后端 10100/10609 同口径）────────────────────────────────────────
describe('S12-7c — 校验：name/uri/Path= 唯一与多 pattern/批内重名/metadata', () => {
  it('名称非法 → 错误提示且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-name-0', 'a!')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-error').exists()).toBe(true)
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.nameInvalid'))
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })

  it('uri 缺 scheme → 错误提示（含格式示例）且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-uri-0', 'user-service:8080')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    const text = tid(wrapper, 'scg-error').text()
    expect(text).toContain(t('v2.scg.uriInvalid'))
    expect(text).toContain('http://user-service:8080')
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })

  it('双 Path= 谓词 → pathMulti 且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'scg-add-pred-0').trigger('click')
    await setInput(wrapper, 'scg-pred-0-1', 'Path=/other/**')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    // 文案带 {a}/{b} 插值（渲染后为具体定义串）→ 断言插值前的固定前缀
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.pathMulti').split('{a}')[0])
    expect(tid(wrapper, 'scg-error').text()).toContain('Path=/api/**')
    expect(tid(wrapper, 'scg-error').text()).toContain('Path=/other/**')
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })

  it('Path=/a,/b 多 pattern → pathMultiPattern（前端即拒）且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-pred-0-0', 'Path=/a,/b')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    // 文案带 {value} 插值 → 断言插值前的固定前缀
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.pathMultiPattern').split('{value}')[0])
    expect(tid(wrapper, 'scg-error').text()).toContain('Path=/a,/b')
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })

  it('批内重名 → dupName 且不调 API（后端 10609 预检）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'scg-add-route').trigger('click')
    await setInput(wrapper, 'scg-name-1', 'api_gateway')
    await setInput(wrapper, 'scg-uri-1', 'http://b:2')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    // 文案带 {names} 插值 → 断言插值前的固定前缀
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.dupName').split('{names}')[0])
    expect(tid(wrapper, 'scg-error').text()).toContain('api_gateway')
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })

  it('metadata 非法 JSON → metadataInvalid 且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-metadata-0', '{oops')
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-error').text()).toContain(t('v2.scg.metadataInvalid'))
    expect(mocks.createRoutesBatch).not.toHaveBeenCalled()
  })
})

// ── 提交：DRAFT 引导 / 失败可重试 ─────────────────────────────────────────
describe('S12-7c — 提交：成功含 DRAFT 引导；失败展示后端 message 可重试', () => {
  it('成功 → toast + 页面 DRAFT 引导条（不自动跳转），引导条按钮跳 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()

    expect(mocks.createRoutesBatch).toHaveBeenCalledTimes(1)
    expect(mocks.toast.success).toHaveBeenCalled()
    const banner = tid(wrapper, 'scg-success')
    expect(banner.exists(), '成功后必须出现 DRAFT 引导条').toBe(true)
    expect(banner.text()).toContain(t('v2.scg.draftGuide'))
    expect(banner.text()).toContain('DRAFT')
    // 不自动跳转（引导用户自己走发布链路）
    expect(router.currentRoute.value.path).toBe('/v2/routes/new')
    // 引导条内的跳转按钮 → /v2/routes（发布入口）
    await tid(wrapper, 'scg-goto-list').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })

  it('10100 后端 message 原样展示（createFailed 前缀），可重试（第二次成功出引导条）', async () => {
    const { wrapper } = await factory()
    // 前端校验已过（表单合法）→ 请求真正发出去 → 模拟后端 10100 结构校验失败
    mocks.createRoutesBatch.mockRejectedValueOnce(new Error('路由名称须为 2-50 位字母、数字或下划线（^[a-zA-Z0-9_]{2,50}$）：api_gateway'))
    await fillValid(wrapper)
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    const err = tid(wrapper, 'scg-submit-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.scg.createFailed'))
    expect(err.text()).toContain('路由名称须为 2-50 位字母、数字或下划线')

    // 重试（默认 mock resolve）→ 成功引导条，错误条消失
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-submit-error').exists()).toBe(false)
    expect(tid(wrapper, 'scg-success').exists()).toBe(true)
  })

  it('10609 重名错误文案原样展示', async () => {
    const { wrapper } = await factory()
    mocks.createRoutesBatch.mockRejectedValueOnce(new Error('路由名 api_gateway 已存在（同环境重名）'))
    await fillValid(wrapper)
    await tid(wrapper, 'scg-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-submit-error').text()).toContain('同环境重名')
    expect(tid(wrapper, 'scg-submit-error').text()).toContain('api_gateway')
  })

  it('取消 → 返回 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    await tid(wrapper, 'scg-cancel').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })
})

// ── 权限 ──────────────────────────────────────────────────────────────────
describe('S12-7c — 权限：无 route:edit 整页 forbidden', () => {
  it('canEdit(route)=false → scg-forbidden，不渲染表单', async () => {
    mocks.canEdit.mockReturnValue(false)
    const { wrapper } = await factory()
    expect(tid(wrapper, 'scg-forbidden').exists()).toBe(true)
    expect(tid(wrapper, 'scg-form-view').exists()).toBe(false)
    expect(tid(wrapper, 'scg-name-0').exists()).toBe(false)
  })
})

// ── YAML 视图：SCG RouteDefinition YAML ──────────────────────────────────
describe('S12-7c — YAML 视图：SCG RouteDefinition 双向同步（可粘回 SCG）', () => {
  it('切到 YAML → 输出 spring.cloud.gateway.routes（id/uri/predicates/filters/order/metadata）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'scg-metadata-0', '{"team":"core"}')
    await tid(wrapper, 'scg-view-yaml').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-yaml-view').exists()).toBe(true)
    const text = (wrapper.find('[data-testid="scg-yaml"] textarea').element as HTMLTextAreaElement).value
    expect(text).toContain('routes:')
    expect(text).toContain('- id: api_gateway')
    expect(text).toContain('uri: http://user-service:8080')
    expect(text).toContain('- Path=/api/**')
    expect(text).toContain('order: 0')
    expect(text).toContain('team: core')
    // 旧 K8s Ingress 形态键不得再出现
    expect(text).not.toMatch(/^\s*spec:/m)
    expect(text).not.toMatch(/pathType:/m)
    // 全局批次字段不属于 SCG RouteDefinition，不出现在 YAML
    expect(text).not.toMatch(/environment:/m)
    expect(text).not.toMatch(/remark:/m)
  })

  it('YAML 例文切回表单 → 字段回填；全局 env/remark/tags 保持表单原值（不属 SCG 文档）', async () => {
    const { wrapper } = await factory()
    await setInput(wrapper, 'scg-environment', 'prod')
    await setInput(wrapper, 'scg-remark', 'kept remark')
    const yaml = [
      'spring:',
      '  cloud:',
      '    gateway:',
      '      routes:',
      '        - id: yaml_route',
      '          uri: http://yaml-svc:9090',
      '          predicates:',
      '            - Path=/v1/**',
      '          filters:',
      '            - StripPrefix=1',
      '          order: 3',
      ''
    ].join('\n')
    await tid(wrapper, 'scg-view-yaml').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="scg-yaml"] textarea').setValue(yaml)
    await tid(wrapper, 'scg-view-form').trigger('click')
    await flushPromises()

    expect(tid(wrapper, 'scg-form-view').exists()).toBe(true)
    expect(inputVal(wrapper, 'scg-name-0')).toBe('yaml_route')
    expect(inputVal(wrapper, 'scg-uri-0')).toBe('http://yaml-svc:9090')
    expect(inputVal(wrapper, 'scg-pred-0-0')).toBe('Path=/v1/**')
    expect(inputVal(wrapper, 'scg-filter-0-0')).toBe('StripPrefix=1')
    expect(inputVal(wrapper, 'scg-order-0')).toBe('3')
    expect(inputVal(wrapper, 'scg-environment')).toBe('prod')
    expect(inputVal(wrapper, 'scg-remark')).toBe('kept remark')
  })

  it('YAML 非法 → 行号错误提示且不切回表单（不崩）', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'scg-view-yaml').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="scg-yaml"] textarea').setValue('routes:\n  - id: x\n   bad: 1\n')
    await tid(wrapper, 'scg-view-form').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'scg-yaml-error').exists()).toBe(true)
    expect(tid(wrapper, 'scg-yaml-error').text()).toContain('3')
    expect(tid(wrapper, 'scg-yaml-view').exists(), '解析失败必须停留 YAML 视图').toBe(true)
    expect(tid(wrapper, 'scg-form-view').exists()).toBe(false)
  })
})

// ── 旧 K8s Ingress 形态下线 + 路由注册 ────────────────────────────────────
describe('S12-7c — 旧 Ingress 形态下线：文件删除 + 注册处指向新组件（入口路径不变）', () => {
  const ROUTES_DIR = path.resolve(__dirname, '..')

  it('旧文件已删除：IngressForm.vue / ingressModel.ts / ingressYaml.ts 不存在', () => {
    for (const f of ['IngressForm.vue', 'ingressModel.ts', 'ingressYaml.ts']) {
      expect(fs.existsSync(path.join(ROUTES_DIR, f)), `旧文件必须删除：${f}`).toBe(false)
    }
    expect(fs.existsSync(path.join(ROUTES_DIR, 'ScgRoutesForm.vue')), '新组件必须存在').toBe(true)
    expect(fs.existsSync(path.join(ROUTES_DIR, 'scgModel.ts')), '新模型层必须存在').toBe(true)
    expect(fs.existsSync(path.join(ROUTES_DIR, 'scgYaml.ts')), '新 YAML 层必须存在').toBe(true)
  })

  it('src/router/index.ts 注册 V2RouteScg（routes/new + route:edit + ScgRoutesForm.vue + v2.page.routeScg）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../router/index.ts'), 'utf-8')
    const at = source.indexOf("name: 'V2RouteScg'")
    expect(at, '未在 src/router/index.ts 找到 V2RouteScg 注册行').toBeGreaterThan(-1)
    const row = source.slice(Math.max(0, at - 240), at + 420)
    expect(row).toContain("path: 'routes/new'")
    expect(row).toMatch(/import\((['"])@\/views-v2\/routes\/ScgRoutesForm\.vue\1\)/)
    expect(row).toContain("permission: 'route:edit'")
    expect(row).toContain('v2.page.routeScg')
    expect(source).not.toContain('IngressForm')
    // 旧向导路由项保留（/v2/routes/wizard 仍在表内）
    expect(source).toContain("name: 'V2RouteWizard'")
    expect(source).toContain("path: 'routes/wizard'")
  })

  it('侧栏/命令面板 labelKey 迁移：LayoutV2 与 useCommandRegistry 用 v2.nav.routeScg + V2RouteScg', () => {
    for (const f of ['../../../layouts/LayoutV2.vue', '../../../components-v2/command/useCommandRegistry.ts']) {
      const source = fs.readFileSync(path.resolve(__dirname, f), 'utf-8')
      expect(source, `${f} 必须引用 V2RouteScg`).toContain("'V2RouteScg'")
      expect(source, `${f} 必须引用 v2.nav.routeScg`).toContain("'v2.nav.routeScg'")
      expect(source, `${f} 不得再引用 V2RouteIngress`).not.toContain('V2RouteIngress')
      expect(source, `${f} 不得再引用 v2.nav.ingress`).not.toContain('v2.nav.ingress')
      expect(source, `${f} 入口路径保持 /v2/routes/new（E2E 03-06 依赖）`).toContain("'/v2/routes/new'")
    }
  })
})
