/**
 * OPT-5-T：插件编辑器 × FcCodeEditor 接线（v2 优化建议 #4 —— docs/ui-v2/gateway4j-v2优化.md
 * §三.4「插件 config 编辑器升级」，对标 APISIX 表单/JSON 双模）。
 * 先红是预期（RED 类型：行为缺失）——Editor.vue 真实存在，但 config 字段仍是
 * FcInput type="textarea"（data-testid="ped-f-config"），未接封装编辑器。本文件全部断言
 * 围绕「textarea → CodeMirror 6 封装组件」的接线行为；组件本体契约（即时解析 / 格式化 /
 * 降级 / 主题 / cde-* testid）见 src/components-v2/editor/__tests__/FcCodeEditor.test.ts
 * （组件缺失型 RED 在彼处）。
 *
 * 接线契约（C 步实现）：
 * - config 字段：`<FcInput type="textarea" data-testid="ped-f-config" :maxlength="10000">`
 *   → `<FcCodeEditor v-model="form.config" :maxlength="10000" />`；v-model 链路（form.config）
 *   与 remark/script 等相邻字段零改动。
 * - 懒加载（主 bundle 防污染 —— 构建已有 1.36MB chunk advisory，CodeMirror 禁止进主包）：
 *   Editor.vue 必须【动态 import】封装组件（defineAsyncComponent(() =>
 *   import('@/components-v2/editor/FcCodeEditor.vue')) 或等价 await import 写法）；
 *   禁止静态 import 该组件、禁止在 Editor.vue 直引任何 CodeMirror 模块。
 *   全仓 CodeMirror import 边界 = 仅 src/components-v2/editor/**（递归 walk 断言，
 *   排除 __tests__；vite.config 现无 manualChunks，动态 import 自然分块，构建配置零改动）。
 * - 提交校验链路【零改动】（优化建议原文钉死：服务端提交时 validateConfig 仍是权威，
 *   前端即时解析只是反馈，不改校验语义）：save() 仍前置 validateAll() 门槛；validateAll
 *   仍 JSON.parse(f.config) + configJsonInvalid（旧手写 Wizard 校验原样保留）。
 *   【措辞裁决】优化建议原文的「validateConfig 仍在提交时调用」在 v2 Editor.vue 的现实
 *   机制 = 客户端 validateAll 的 JSON.parse 前置门 + 服务端 createPlugin/updatePlugin 内部
 *   的 validateConfig 权威校验（页面从不直调 validateConfig API，见 Editor.test.ts mock 面
 *   头注「页面实际只用 getPlugin/createPlugin/updatePlugin/validateGroovy/listPlugins」）——
 *   故 fs 断言钉住的是前端侧 JSON.parse 门链路，语义等价于「提交校验不被前端即时解析
 *   取代/削弱」。
 * - a11y：config 字段 label（for="ped-config"）保留；cde-content 自带 aria-label 双保险。
 * - 测试替身：vi.mock 封装组件为可控 stub（cdeStub.ts）。探针实证：工厂 mock 可注册在
 *   【尚不存在】的模块路径上——RED 阶段 Editor.vue 尚未 import 它 = mock 无害、断言照常
 *   红；C 步接线后动态 import 命中 stub，本文件永远与 CodeMirror/jsdom 解耦。
 *   Editor.test.ts（既有 40 例套件）同法拦截 + configArea 双形态取值助手，保证迁移全程绿。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'node:fs'
import path from 'node:path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import Editor from '@/views-v2/plugins/Editor.vue'
import { cdeStub } from '@/components-v2/editor/__tests__/cdeStub'

const mocks = vi.hoisted(() => ({
  getPlugin: vi.fn(),
  createPlugin: vi.fn(),
  updatePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  validateConfig: vi.fn(),
  validateGroovy: vi.fn(),
  getBuiltinSchema: vi.fn(),
  listPlugins: vi.fn(),
  listBuiltinTypes: vi.fn(),
  listGlobalPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  sortGlobalPlugins: vi.fn(),
  getRuntimeStatus: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  fcConfirm: vi.fn(() => Promise.resolve(true)),
  canEdit: vi.fn(() => true)
}))

vi.mock('@/api/plugins', () => ({
  getPlugin: mocks.getPlugin,
  createPlugin: mocks.createPlugin,
  updatePlugin: mocks.updatePlugin,
  deletePlugin: mocks.deletePlugin,
  validateConfig: mocks.validateConfig,
  validateGroovy: mocks.validateGroovy,
  getBuiltinSchema: mocks.getBuiltinSchema,
  listPlugins: mocks.listPlugins,
  listBuiltinTypes: mocks.listBuiltinTypes,
  listGlobalPlugins: mocks.listGlobalPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  sortGlobalPlugins: mocks.sortGlobalPlugins,
  getRuntimeStatus: mocks.getRuntimeStatus
}))
vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: vi.fn(() => true),
    hasAnyPermission: vi.fn(() => true),
    canEdit: mocks.canEdit
  })
}))
vi.mock('@/components', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return { ...actual, toast: mocks.toast }
})
// —— OPT-5 关键：封装组件用 stub 拦截（工厂 mock 注册在尚不存在的路径上，RED 阶段无害，
// C 步接线后动态 import 命中 stub —— 说明见文件头「测试替身」段）——
vi.mock('@/components-v2/editor/FcCodeEditor.vue', async () => {
  return { default: cdeStub }
})

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })
const stub = { template: '<div />' }

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Editor.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: '7001',
    plugin_id: 'my-plugin',
    plugin_name: '我的插件',
    plugin_type: 'GROOVY',
    plugin_phase: 'PRE',
    scope: 'ROUTE',
    status: 'ENABLED',
    sort_order: 3,
    config: '{"limit":10}',
    remark: '备注甲',
    script_content: 'def x = 1; return true',
    group_member_ids: [],
    ...over
  }
}

async function factory(opts: { id?: string } = {}): Promise<{ wrapper: VueWrapper<any>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/v2/plugins/editor/:id?', name: 'V2PluginEditor', component: Editor as any },
      { path: '/v2/plugins/chain', component: stub }
    ]
  })
  await router.push(opts.id ? `/v2/plugins/editor/${opts.id}` : '/v2/plugins/editor/new')
  await router.isReady()
  const wrapper = mount(Editor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  await flushPromises() // 两轮：defineAsyncComponent（C 步接线后）需要额外一轮 microtask
  return { wrapper, router }
}

const one = (w: VueWrapper<any>, tid: string) => w.find(`[data-testid="${tid}"]`)
const need = (w: VueWrapper<any>, tid: string, why = tid) => {
  const el = one(w, tid)
  expect(el.exists(), `缺少 data-testid=${tid}（${why}）`).toBe(true)
  return el
}
const inputOf = (w: VueWrapper<any>, tid: string) => w.find(`input[data-testid="${tid}"]`)

const EDIT_ROW = makeRow()

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getPlugin.mockReset().mockImplementation(() => Promise.resolve({ ...EDIT_ROW }))
  mocks.createPlugin.mockReset().mockResolvedValue({})
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.listPlugins.mockReset().mockResolvedValue({ records: [], total: 0, size: 200, current: 1, pages: 0 })
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.canEdit.mockReturnValue(true)
  mocks.toast.success.mockReset()
})

// ── 接线（DOM/行为）───────────────────────────────────────────────────────
describe('OPT-5 — 接线（config 字段 → FcCodeEditor，v-model 链路不变）', () => {
  it('create：config 字段渲染封装编辑器（cde-root/cde-content），初值 {}', async () => {
    const { wrapper } = await factory()
    expect(need(wrapper, 'cde-root', '封装编辑器根').exists()).toBe(true)
    const content = wrapper.find('textarea[data-testid="cde-content"]')
    expect(content.exists(), '封装编辑器须渲染 cde-content textarea（stub 或真组件同形）').toBe(true)
    expect((content.element as HTMLTextAreaElement).value).toBe('{}')
    // 旧 textarea 形态退场：不再有 ped-f-config
    expect(one(wrapper, 'ped-f-config').exists()).toBe(false)
  })

  it('edit：编辑器回填行内 config（{"limit":10}）', async () => {
    const { wrapper } = await factory({ id: '7001' })
    const content = wrapper.find('textarea[data-testid="cde-content"]')
    expect(content.exists()).toBe(true)
    expect((content.element as HTMLTextAreaElement).value).toBe('{"limit":10}')
  })

  it('编辑器输入 → form.config 回写 → create 保存 payload config=新值（v-model 链路不变）', async () => {
    const { wrapper } = await factory()
    await inputOf(wrapper, 'ped-f-name').setValue('my_plugin')
    await inputOf(wrapper, 'ped-f-plugin-id').setValue('my-plugin')
    const content = need(wrapper, 'cde-content', '封装编辑器编辑区')
    await content.setValue('{"limit":100}')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.createPlugin).toHaveBeenCalledTimes(1)
    expect(mocks.createPlugin.mock.calls[0][0]).toEqual(expect.objectContaining({ config: '{"limit":100}' }))
    expect(mocks.toast.success).toHaveBeenCalledWith(t('v2.plugins.saveSuccess'))
  })

  it('编辑器输入 → edit 保存 payload config=新值（updatePlugin JSON PATCH 键集不变）', async () => {
    const { wrapper } = await factory({ id: '7001' })
    const content = need(wrapper, 'cde-content', '封装编辑器编辑区')
    await content.setValue('{"limit":50}')
    await need(wrapper, 'ped-save', '保存钮').trigger('click')
    await flushPromises()
    expect(mocks.updatePlugin).toHaveBeenCalledTimes(1)
    expect(mocks.updatePlugin.mock.calls[0][0]).toBe('7001')
    const payload = mocks.updatePlugin.mock.calls[0][1] as Record<string, unknown>
    expect(payload.config).toBe('{"limit":50}')
    expect(Object.keys(payload).sort()).toEqual(['config', 'plugin_phase', 'remark', 'scope', 'script_content', 'sort_order'])
  })

  it('编辑器输入计入脏离开（collectDomValues 捕获 textarea[data-testid] DOM 基线）→ 离开弹确认', async () => {
    mocks.fcConfirm.mockResolvedValue(false)
    const { wrapper, router } = await factory({ id: '7001' })
    await need(wrapper, 'cde-content', '封装编辑器编辑区').setValue('{"limit":99}')
    await router.push('/v2/plugins/chain')
    await flushPromises()
    expect(mocks.fcConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.fcConfirm).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'danger',
      title: expect.stringContaining(t('v2.plugins.unsavedChanges'))
    }))
    // confirm=false → 留在编辑页
    expect(router.currentRoute.value.path).toBe('/v2/plugins/editor/7001')
  })
})

// ── fs 契约（懒加载边界 + 校验语义零改动）────────────────────────────────
describe('OPT-5 — fs 源码契约', () => {
  it('懒加载：Editor.vue 动态 import 封装组件（变量化路径仅断言 import( + 目标路径同现）', () => {
    const source = readSource()
    expect(source).toMatch(/import\(\s*['"]@\/components-v2\/editor\/FcCodeEditor\.vue['"]\s*\)/)
  })

  it('主 bundle 防污染：Editor.vue 无静态 import 封装组件、无 CodeMirror 直引', () => {
    const source = readSource()
    expect(source).not.toMatch(/import\s+\w+\s+from\s+['"]@\/components-v2\/editor\/FcCodeEditor\.vue['"]/)
    expect(source).not.toMatch(/from\s+['"](?:codemirror|@codemirror\/)[^'"]*['"]/)
    expect(source).not.toMatch(/import\(\s*['"](?:codemirror|@codemirror\/)/)
  })

  it('全仓 CodeMirror import 边界 = 仅 src/components-v2/editor/**（递归 walk，排除 __tests__）', () => {
    const srcRoot = path.resolve(__dirname, '../../..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue
          walk(p)
        } else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
          const normalized = p.replaceAll(path.sep, '/')
          if (normalized.includes('/components-v2/editor/')) continue
          if (/from\s+['"](?:codemirror|@codemirror\/)|import\(\s*['"](?:codemirror|@codemirror\/)/.test(fs.readFileSync(p, 'utf-8'))) {
            offenders.push(normalized)
          }
        }
      }
    }
    walk(srcRoot)
    expect(offenders, `CodeMirror 只允许出现在 src/components-v2/editor/**（懒加载边界），违规：${offenders.join(', ')}`).toEqual([])
  })

  it('提交校验链路零改动：save() 前置 validateAll 门、validateAll 仍 JSON.parse(f.config) + configJsonInvalid', () => {
    const source = readSource()
    expect(source).toMatch(/if\s*\(!validateAll\(\)\)\s*return/)
    expect(source).toMatch(/JSON\.parse\(f\.config\)/)
    expect(source).toMatch(/v2\.plugins\.configJsonInvalid/)
    // 服务端 validateConfig 权威的措辞裁决见文件头；前端侧不得出现「解析合法才允许保存」
    // 之外的替代校验面（即不允许删除既有 configJsonInvalid 文案键）
    expect(dig(zhCN, 'v2.plugins.configJsonInvalid'), 'zh-CN configJsonInvalid 必须保留').toBeDefined()
    expect(dig(enUS, 'v2.plugins.configJsonInvalid'), 'en-US configJsonInvalid 必须保留').toBeDefined()
  })

  it('模板已换封装组件：v-model="form.config" + :maxlength="10000" + label 保留 + ped-f-config 退场', () => {
    const template = readTemplate()
    expect(template).toMatch(/<FcCodeEditor/)
    expect(template).toMatch(/v-model="form\.config"/)
    expect(template).toMatch(/:maxlength="10000"/)
    expect(template).toMatch(/for="ped-config"/)
    expect(template, '旧 textarea 形态 data-testid=ped-f-config 应退场').not.toMatch(/ped-f-config/)
  })
})
