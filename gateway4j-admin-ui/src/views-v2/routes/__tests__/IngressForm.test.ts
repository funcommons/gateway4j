/**
 * S12-4-T：v2 路由创建单页「K8s Ingress 风格」+ YAML 视图测试。
 * 契约来源：docs/ui-v2/实施契约.md §10 S12 批（用户裁决：不要向导，仿 K8s Ingress 配置页；
 * pathType 三值全上；SCG 原生谓词；批量 POST /v1/routes/ingress）。
 *
 * ══ 页面契约（T 固化，C 不得偏离）══
 * 落点：src/views-v2/routes/IngressForm.vue（单页，非向导）。
 * 路由：/v2/routes/new，name=V2RouteIngress，permission=route:edit（沿用旧向导权限）。
 * 入口：v2 路由列表页「新建」按钮跳 /v2/routes/new（旧 /v2/routes/wizard 路由项保留不动）。
 *
 * 结构（K8s Ingress 视觉语法，自上而下）：
 *   metadata：name（必填 ^[a-zA-Z0-9_]{2,50}$）/ environment / remark / tags
 *   spec.rules[]：host（可空 = 不限域名）+ paths[]（path | pathType | backend.service | backend.port）
 *   spec.filters[]：插件绑定（SCG filters ↔ gateway4j 插件）
 *   spec.predicates[]：高级谓词（SCG 原生定义串，如 Host=**.example.com）
 *   底部：保存 / 取消
 * 双视图：表单 / YAML（同一份 Ingress 结构的 YAML 表达，双向同步；YAML 解析失败给行号）。
 *
 * ══ 载荷契约（§10 POST /v1/routes/ingress）══
 * { name, environment, remark, tags,
 *   rules: [{ host, paths: [{ path, pathType, backend: { service, port } }] }],
 *   plugins: [{ plugin_id, binding_config }],
 *   predicates: string[] }
 * - pathType：PREFIX → `/api/**`（用户填 /api，自动补 /**）；EXACT → 原样；
 *   IMPLEMENTATION_SPECIFIC → 原样（用户直填 SCG PathPattern 片段）。
 * - upstream_url：**前端不携带**（S12-4 收口裁决）——后端按 §10 从 service+port 合成，
 *   后端是唯一真相源；前端再带一份 = 两个真相源。
 * - predicates：路由级 SCG 谓词定义串（顶层字段，与 rules/plugins 平级）。
 *
 * ══ i18n key 全表（v2.ingress.*，zh-CN/en-US 同步加，铁律 6）══
 * title sectionMetadata sectionRules sectionFilters sectionPredicates
 * fieldName fieldEnvironment fieldRemark fieldTags fieldHost fieldPath fieldPathType
 * fieldService fieldPort fieldPredicateType fieldPredicateArg
 * addRule addPath addPlugin addPredicate removeRule removePath removePlugin removePredicate
 * pathTypePrefix pathTypeExact pathTypeImplementationSpecific
 * viewForm viewYaml save cancel createSuccess createFailed forbidden
 * nameRequired nameInvalid pathRequired serviceRequired portInvalid hostInvalid
 * ruleNeedPath predicateArgRequired yamlInvalid pluginsEmpty pluginsLoadFailed
 * emptyValue emptyRuleHint
 *
 * ══ DOM 契约（data-testid，前缀 ing-）══
 * ing-root / ing-forbidden
 * ing-view-form / ing-view-yaml（双视图切换钮，aria-pressed 同步当前视图）
 * ing-form-view / ing-yaml-view（两个视图容器）
 * ing-yaml（YAML 编辑区容器；内含 textarea）
 * ing-yaml-error（YAML 解析失败行号提示）
 * ing-name / ing-environment / ing-remark / ing-tags
 * ing-rule-<i> / ing-host-<i> / ing-rm-rule-<i> / ing-add-rule
 * ing-path-<i>-<j> / ing-pathtype-<i>-<j> / ing-service-<i>-<j> / ing-port-<i>-<j>
 * ing-rm-path-<i>-<j> / ing-add-path-<i>
 * ing-plugin-select / ing-add-plugin / ing-plugin-<plugin_id> / ing-rm-plugin-<plugin_id>
 * ing-plugin-cfg-<plugin_id>
 * ing-add-predicate / ing-pred-type-<i> / ing-pred-arg-<i> / ing-rm-predicate-<i> / ing-pred-def-<i>
 * ing-error（校验错误条） / ing-submit-error（提交失败错误条）
 * ing-submit / ing-cancel
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
  createIngressRoute: vi.fn(),
  listPlugins: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/routes', () => ({
  createIngressRoute: mocks.createIngressRoute
}))
vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins
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
//     与 FcCodeEditor.test.ts / CommandPalette.test.ts 同法）——
const INGRESS_PATH = '@/views-v2/routes/IngressForm.vue'
async function loadIngressForm(): Promise<any> {
  try {
    const mod = await import(INGRESS_PATH)
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

const PLUGINS = [
  { id: 'p1', plugin_id: 'dingtalk', plugin_name: 'DingTalk', plugin_type: 'BUILTIN', plugin_phase: 'PRE', scope: 'ROUTE', status: 'ENABLED', sort_order: 0, config: '{}' },
  { id: 'p2', plugin_id: 'ratelimit', plugin_name: 'RateLimit', plugin_type: 'BUILTIN', plugin_phase: 'PRE', scope: 'ROUTE', status: 'ENABLED', sort_order: 1, config: '{}' }
]

async function factory(): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const IngressForm = await loadIngressForm()
  expect(IngressForm, 'IngressForm.vue 组件缺失（RED 预期）').toBeTruthy()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/routes/new', component: IngressForm as any },
      { path: '/v2/routes', component: stub }
    ]
  })
  await router.push('/v2/routes/new')
  await router.isReady()
  const wrapper = mount(IngressForm, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
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
const selectEl = (w: VueWrapper<any>, id: string) => w.find(`select[data-testid="${id}"]`)
const selectVal = (w: VueWrapper<any>, id: string) => (selectEl(w, id).element as HTMLSelectElement).value

async function setInput(w: VueWrapper<any>, id: string, value: string) {
  await inputEl(w, id).setValue(value)
}
async function setSelect(w: VueWrapper<any>, id: string, value: string) {
  await selectEl(w, id).setValue(value)
}

/** 填一份最小可用表单（name/path/service/port 齐） */
async function fillValid(w: VueWrapper<any>) {
  await setInput(w, 'ing-name', 'api_gateway')
  await setInput(w, 'ing-host-0', 'api.example.com')
  await setInput(w, 'ing-path-0-0', '/api')
  await setInput(w, 'ing-service-0-0', 'user-service')
  await setInput(w, 'ing-port-0-0', '8080')
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.createIngressRoute.mockReset().mockResolvedValue({ created: [] })
  mocks.listPlugins.mockReset().mockResolvedValue({ records: PLUGINS, total: 2, page: 1, page_size: 100 })
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  mocks.canEdit.mockReturnValue(true)
})

// ── i18n ──────────────────────────────────────────────────────────────────
const KEYS = [
  'title', 'sectionMetadata', 'sectionRules', 'sectionFilters', 'sectionPredicates',
  'fieldName', 'fieldEnvironment', 'fieldRemark', 'fieldTags', 'fieldHost', 'fieldPath',
  'fieldPathType', 'fieldService', 'fieldPort', 'fieldPredicateType', 'fieldPredicateArg',
  'addRule', 'addPath', 'addPlugin', 'addPredicate', 'removeRule', 'removePath', 'removePlugin',
  'removePredicate', 'pathTypePrefix', 'pathTypeExact', 'pathTypeImplementationSpecific',
  'viewForm', 'viewYaml', 'save', 'cancel', 'createSuccess', 'createFailed', 'forbidden',
  'nameRequired', 'nameInvalid', 'pathRequired', 'serviceRequired', 'portInvalid', 'hostInvalid',
  'ruleNeedPath', 'predicateArgRequired', 'predicateHostConflict', 'yamlInvalid', 'pluginsEmpty', 'pluginsLoadFailed',
  'emptyValue', 'emptyRuleHint'
].map((k) => `v2.ingress.${k}`)

describe('S12-4 — i18n key 全表双语存在（铁律 6，v2.ingress.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

// ── 结构渲染与行操作 ──────────────────────────────────────────────────────
describe('S12-4 — 结构：rules / paths 行渲染与增删', () => {
  it('默认渲染一条规则 + 一条路径（K8s rules/paths 骨架）', async () => {
    const { wrapper } = await factory()
    expect(tid(wrapper, 'ing-root').exists()).toBe(true)
    expect(tid(wrapper, 'ing-rule-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-host-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-path-0-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-service-0-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-port-0-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-name').exists()).toBe(true)
    expect(tid(wrapper, 'ing-add-rule').exists()).toBe(true)
  })

  it('添加规则 → 新规则行渲染；删除规则 → 行消失', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'ing-add-rule').trigger('click')
    expect(tid(wrapper, 'ing-rule-1').exists()).toBe(true)
    expect(tid(wrapper, 'ing-path-1-0').exists()).toBe(true)
    await tid(wrapper, 'ing-rm-rule-1').trigger('click')
    expect(tid(wrapper, 'ing-rule-1').exists()).toBe(false)
    expect(tid(wrapper, 'ing-rule-0').exists()).toBe(true)
  })

  it('添加路径 → 新路径行渲染；删除路径 → 行消失', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'ing-add-path-0').trigger('click')
    expect(tid(wrapper, 'ing-path-0-1').exists()).toBe(true)
    await tid(wrapper, 'ing-rm-path-0-1').trigger('click')
    expect(tid(wrapper, 'ing-path-0-1').exists()).toBe(false)
    expect(tid(wrapper, 'ing-path-0-0').exists()).toBe(true)
  })

  it('pathType 下拉恰 3 项，值为 PREFIX / EXACT / IMPLEMENTATION_SPECIFIC', async () => {
    const { wrapper } = await factory()
    const opts = selectEl(wrapper, 'ing-pathtype-0-0').findAll('option')
    expect(opts.length).toBe(3)
    expect(opts.map((o) => (o.element as HTMLOptionElement).value)).toEqual([
      'PREFIX', 'EXACT', 'IMPLEMENTATION_SPECIFIC'
    ])
  })

  it('高级谓词区为折叠区（默认收起，展开后可加行）', async () => {
    const { wrapper } = await factory()
    const collapse = wrapper.find('.ing-collapse')
    expect(collapse.exists(), '高级谓词区必须是折叠区（FcCollapse）').toBe(true)
    expect(wrapper.find('.el-collapse-item').exists()).toBe(true)
    // 折叠态下内容仍在 DOM（EP v-show），但点击「添加谓词」后行渲染
    await tid(wrapper, 'ing-add-predicate').trigger('click')
    expect(tid(wrapper, 'ing-pred-type-0').exists()).toBe(true)
    expect(tid(wrapper, 'ing-pred-arg-0').exists()).toBe(true)
  })
})

// ── 载荷形状 ──────────────────────────────────────────────────────────────
describe('S12-4 — 载荷：§10 契约逐字一致', () => {
  it('payload 形状与 §10 一致（toStrictEqual：name/rules/paths/backend/plugins/predicates）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'ing-remark', 'demo route')
    await setInput(wrapper, 'ing-tags', 'core,api')
    // 绑定插件
    await setSelect(wrapper, 'ing-plugin-select', 'dingtalk')
    await tid(wrapper, 'ing-add-plugin').trigger('click')
    // 高级谓词：Host + 参数
    await tid(wrapper, 'ing-add-predicate').trigger('click')
    await setSelect(wrapper, 'ing-pred-type-0', 'Host')
    await setInput(wrapper, 'ing-pred-arg-0', '**.example.com')

    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()

    expect(mocks.createIngressRoute).toHaveBeenCalledTimes(1)
    expect(mocks.createIngressRoute.mock.calls[0][0]).toStrictEqual({
      name: 'api_gateway',
      environment: 'default',
      remark: 'demo route',
      tags: 'core,api',
      rules: [
        {
          host: 'api.example.com',
          paths: [
            {
              path: '/api/**',
              pathType: 'PREFIX',
              backend: { service: 'user-service', port: '8080' }
            }
          ]
        }
      ],
      plugins: [{ plugin_id: 'dingtalk', binding_config: '{}' }],
      predicates: ['Host=**.example.com']
    })
  })

  it('pathType 三值映射：PREFIX 补 /**、EXACT 原样、IMPLEMENTATION_SPECIFIC 原样', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    // 第 1 条：EXACT
    await setSelect(wrapper, 'ing-pathtype-0-0', 'EXACT')
    await setInput(wrapper, 'ing-path-0-0', '/api/exact')
    // 第 2 条：ImplementationSpecific（SCG PathPattern 片段）
    await tid(wrapper, 'ing-add-path-0').trigger('click')
    await setSelect(wrapper, 'ing-pathtype-0-1', 'IMPLEMENTATION_SPECIFIC')
    await setInput(wrapper, 'ing-path-0-1', '/api/{id:[0-9]+}')
    await setInput(wrapper, 'ing-service-0-1', 'order-service')
    await setInput(wrapper, 'ing-port-0-1', '9090')

    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()

    const payload = mocks.createIngressRoute.mock.calls[0][0]
    expect(payload.rules[0].paths[0]).toStrictEqual({
      path: '/api/exact',
      pathType: 'EXACT',
      backend: { service: 'user-service', port: '8080' }
    })
    expect(payload.rules[0].paths[1]).toStrictEqual({
      path: '/api/{id:[0-9]+}',
      pathType: 'IMPLEMENTATION_SPECIFIC',
      backend: { service: 'order-service', port: '9090' }
    })
  })

  it('高级谓词：Host + 参数 → SCG 定义串 Host=**.example.com 进载荷', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'ing-add-predicate').trigger('click')
    await setSelect(wrapper, 'ing-pred-type-0', 'Host')
    await setInput(wrapper, 'ing-pred-arg-0', '**.example.com')
    expect(tid(wrapper, 'ing-pred-def-0').text()).toContain('Host=**.example.com')

    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(mocks.createIngressRoute.mock.calls[0][0].predicates).toStrictEqual(['Host=**.example.com'])
  })

  it('Host 冲突提示：rule.host 非空 → 高级谓词区提示（AND 同时生效）；host 为空 → 无提示', async () => {
    const { wrapper } = await factory()
    // 无 host → 无提示
    expect(tid(wrapper, 'ing-pred-host-conflict').exists()).toBe(false)
    // 有 host → 提示出现且点明域名
    await setInput(wrapper, 'ing-host-0', 'api.example.com')
    const hint = tid(wrapper, 'ing-pred-host-conflict')
    expect(hint.exists(), '规则已限定域名时必须提示 Host 谓词叠加风险').toBe(true)
    expect(hint.text()).toContain('api.example.com')
    expect(hint.text()).toContain('AND')
  })
})

// ── 校验 ──────────────────────────────────────────────────────────────────
describe('S12-4 — 校验：错误提示且不调 API', () => {
  it('名称非法 → 错误提示且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'ing-name', 'a!')
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-error').exists()).toBe(true)
    expect(tid(wrapper, 'ing-error').text()).toContain(t('v2.ingress.nameInvalid'))
    expect(mocks.createIngressRoute).not.toHaveBeenCalled()
  })

  it('路径缺失 → 错误提示且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'ing-path-0-0', '')
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-error').text()).toContain(t('v2.ingress.pathRequired'))
    expect(mocks.createIngressRoute).not.toHaveBeenCalled()
  })

  it('服务缺失 → 错误提示且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'ing-service-0-0', '')
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-error').text()).toContain(t('v2.ingress.serviceRequired'))
    expect(mocks.createIngressRoute).not.toHaveBeenCalled()
  })

  it('端口非数字 → 错误提示且不调 API', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await setInput(wrapper, 'ing-port-0-0', 'abc')
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-error').text()).toContain(t('v2.ingress.portInvalid'))
    expect(mocks.createIngressRoute).not.toHaveBeenCalled()
  })
})

// ── 提交 ──────────────────────────────────────────────────────────────────
describe('S12-4 — 提交：成功 / 失败可重试', () => {
  it('成功 → toast.success + 跳回 /v2/routes', async () => {
    const { wrapper, router } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(mocks.createIngressRoute).toHaveBeenCalledTimes(1)
    expect(mocks.toast.success).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })

  it('失败 → 错误条展示 e.message 且可重试（第二次成功即跳转）', async () => {
    const { wrapper, router } = await factory()
    mocks.createIngressRoute.mockRejectedValueOnce(new Error('boom'))
    await fillValid(wrapper)
    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-submit-error').exists()).toBe(true)
    expect(tid(wrapper, 'ing-submit-error').text()).toContain('boom')
    expect(router.currentRoute.value.path).toBe('/v2/routes/new')

    await tid(wrapper, 'ing-submit').trigger('click')
    await flushPromises()
    expect(mocks.createIngressRoute).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/v2/routes')
  })
})

// ── YAML 视图 ─────────────────────────────────────────────────────────────
describe('S12-4 — YAML 视图：双向同步', () => {
  it('切到 YAML → 看到序列化内容（metadata / spec / rules）', async () => {
    const { wrapper } = await factory()
    await fillValid(wrapper)
    await tid(wrapper, 'ing-view-yaml').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-yaml-view').exists()).toBe(true)
    const text = (wrapper.find('[data-testid="ing-yaml"] textarea').element as HTMLTextAreaElement).value
    expect(text).toContain('metadata:')
    expect(text).toContain('name: api_gateway')
    expect(text).toContain('spec:')
    expect(text).toContain('rules:')
    expect(text).toContain('pathType: PREFIX')
    expect(text).toContain('service: user-service')
  })

  it('改 YAML 再切回表单 → 字段同步', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'ing-view-yaml').trigger('click')
    await flushPromises()
    const yaml = [
      'metadata:',
      '  name: yaml_route',
      '  environment: prod',
      '  remark: from yaml',
      '  tags: yaml',
      'spec:',
      '  rules:',
      '    - host: yaml.example.com',
      '      paths:',
      '        - path: /v1',
      '          pathType: EXACT',
      '          backend:',
      '            service: yaml-svc',
      '            port: "9090"',
      '  filters: []',
      '  predicates: []',
      ''
    ].join('\n')
    await wrapper.find('[data-testid="ing-yaml"] textarea').setValue(yaml)
    await tid(wrapper, 'ing-view-form').trigger('click')
    await flushPromises()

    expect(tid(wrapper, 'ing-form-view').exists()).toBe(true)
    expect(inputVal(wrapper, 'ing-name')).toBe('yaml_route')
    expect(inputVal(wrapper, 'ing-environment')).toBe('prod')
    expect(inputVal(wrapper, 'ing-host-0')).toBe('yaml.example.com')
    expect(inputVal(wrapper, 'ing-path-0-0')).toBe('/v1')
    expect(selectVal(wrapper, 'ing-pathtype-0-0')).toBe('EXACT')
    expect(inputVal(wrapper, 'ing-service-0-0')).toBe('yaml-svc')
    expect(inputVal(wrapper, 'ing-port-0-0')).toBe('9090')
  })

  it('YAML 非法 → 行号错误提示且不切回表单', async () => {
    const { wrapper } = await factory()
    await tid(wrapper, 'ing-view-yaml').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="ing-yaml"] textarea').setValue('metadata:\n  name: x\n   bad: 1\n')
    await tid(wrapper, 'ing-view-form').trigger('click')
    await flushPromises()
    expect(tid(wrapper, 'ing-yaml-error').exists()).toBe(true)
    expect(tid(wrapper, 'ing-yaml-error').text()).toContain('3')
    expect(tid(wrapper, 'ing-yaml-view').exists(), '解析失败必须停留 YAML 视图').toBe(true)
    expect(tid(wrapper, 'ing-form-view').exists()).toBe(false)
  })
})

// ── 入口与路由注册 ───────────────────────────────────────────────────────
describe('S12-4 — 入口与路由注册', () => {
  it('src/router/index.ts 注册 V2RouteIngress（routes/new + route:edit + IngressForm.vue）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../router/index.ts'), 'utf-8')
    const at = source.indexOf("name: 'V2RouteIngress'")
    expect(at, '未在 src/router/index.ts 找到 V2RouteIngress 注册行').toBeGreaterThan(-1)
    const row = source.slice(Math.max(0, at - 240), at + 420)
    expect(row).toContain("path: 'routes/new'")
    expect(row).toMatch(/import\((['"])@\/views-v2\/routes\/IngressForm\.vue\1\)/)
    expect(row).toContain("permission: 'route:edit'")
  })

  it('旧向导路由项保留（/v2/routes/wizard 仍在表内，入口摘除但文件与路由不删）', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../router/index.ts'), 'utf-8')
    expect(source).toContain("name: 'V2RouteWizard'")
    expect(source).toContain("path: 'routes/wizard'")
  })
})
