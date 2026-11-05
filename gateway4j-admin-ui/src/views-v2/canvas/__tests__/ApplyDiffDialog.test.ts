/**
 * S9b-T：v2 应用到路由树弹窗契约测试（docs/ui-v2/实施契约.md §4 S9 行拆步
 * 「ApplyDiffDialog.vue(dry_run 三段式,~190)」+ 旧画布 Canvas.vue L623-728 apply 交互语义随迁）。
 * 先红是预期：组件由 S9b-C 实现，落地前本文件为整文件收集失败级别的红
 * （Failed to resolve import …/ApplyDiffDialog.vue，vitest + vue-tsc 同理，合规先红形态）。
 *
 * ── 三段式语义（读旧 Canvas.applyToTree/confirmApply 后裁决，头注存证）───────
 * 段一·预览：入口触发 open() → applyCanvas(routeId, { nodes, edges, dry_run: true }) 恰一次；
 *   预览期间弹窗开 + cnv-diff-loading；空差异（create/update/delete 全空）→ info toast
 *   （applyNoDiff）且弹窗不渲染（旧 isEmptyDiff → toast.info 语义随迁）；失败 → cnv-diff-error。
 * 段二·审阅：三组 diff（create/update/delete）+ 条件变更计数；删除行逐条 checkbox 默认
 *   不勾选（旧 applyDeleteRows _checked:false 随迁，须用户逐条确认）；变更说明选填
 *   （maxlength 200，每次预览打开时清空，旧 applyChangeDesc 语义随迁）。
 * 段三·确认：cnv-diff-confirm → applyCanvas(routeId, { nodes, edges, dry_run: false,
 *   confirm_delete_ids: 勾选 id, change_description: 去空格后非空才携带（键不出现，旧 H7b
 *   最小 payload 形状随迁））；成功 → 弹窗关闭 + emit('applied')（toast/发布提示/轮询归
 *   Canvas 接线）；失败 → cnv-diff-error + 弹窗保持打开 + 不 emit applied。
 * 取消：cnv-diff-cancel → 仅关闭弹窗，不发第二次 applyCanvas（无写请求）。
 *
 * ── 公开 API 契约（S9b-C 照此实现）────────────────────────────────────────
 * // src/views-v2/canvas/ApplyDiffDialog.vue，defineOptions name 'V2ApplyDiffDialog'
 * props: {
 *   routeId: string
 *   getSnapshot: () => { nodes: any[]; edges: any[] }   // Canvas 传 live 取数器；段一/段三各自取最新
 * }
 * emits: { applied(): void }                             // 段三成功后恰一次
 * defineExpose({ open })                                 // open(): Promise<void>，Canvas 守卫
 *   // （孤儿分发/嵌套深度校验，见 useCanvasValidation）通过后调用
 *
 * ── 错误态与 toast 裁决 ──────────────────────────────────────────────────
 * 错误条文案一律 i18n（v2.canvas.applyFailed），不透传原始异常 message（S9a 契约随迁）；
 * toast 走 SDK 统一入口 toast（@/components，内部 ElMessage）——测试以 ElMessage spy 断言。
 *
 * ── testid 契约表（data-testid，cnv-diff-*，拆步裁决②）─────────────────────
 * cnv-diff-dialog           弹窗内容根（未打开/预览失败/空差异时不渲染）
 * cnv-diff-loading          段一预览中提示（applyLoading）
 * cnv-diff-error            段一/段三失败错误条（role=alert，applyFailed，不含原始 message）
 * cnv-diff-conditions       条件变更计数（applyConditionsChanges 插值 {n}）
 * cnv-diff-group-create     新增分组（标题 applyGroupCreate + 条数；行 cnv-diff-create-row，
 *                           内含 label/path/upstream_url）
 * cnv-diff-group-update     更新分组（行 cnv-diff-update-row，内含 id + 字段名 + 'from → to' 细节）
 * cnv-diff-group-delete     删除分组（标题 applyGroupDelete + applyDeleteTip 提示；
 *                           行 cnv-diff-delete-row-{id} 内含勾选框 cnv-diff-delete-check-{id}，
 *                           默认不勾选）
 * cnv-diff-desc             变更说明 textarea（placeholder=applyDescPlaceholder，maxlength 200，
 *                           testid 落原生 textarea）
 * cnv-diff-cancel           取消按钮（文案 common.cancel）——仅关闭，无写请求
 * cnv-diff-confirm          确认按钮（文案 applyConfirm；confirmLoading 时 disabled）
 *
 * ── i18n key 清单（v2.canvas.* 新树，zh/en 同步加，铁律 6；12 个）───────────
 * applyTitle('应用到路由树') / applyConfirm('确认应用') / applyNoDiff('画布与路由树一致，无需应用') /
 * applyFailed('应用失败，请稍后重试') / applyLoading('正在生成差异预览…') /
 * applyConditionsChanges('条件变更 {n} 处') / applyGroupCreate('新增') / applyGroupUpdate('更新') /
 * applyGroupDelete('删除') / applyDeleteTip('勾选确认后才会在应用时删除（默认不删）') /
 * applyDescLabel('变更说明（选填）') / applyDescPlaceholder('选填，留痕于变更记录')
 * （取消按钮复用 common.cancel；分组空态复用 common.empty —— 公共树，不引用 route.* 旧树）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'
import ApplyDiffDialog from '@/views-v2/canvas/ApplyDiffDialog.vue'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn(),
  applyCanvas: vi.fn()
}))

// 铁律：mock '@/api/routes' 全量导出四成员（本组件只应消费 applyCanvas）
vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  getRoute: mocks.getRoute,
  saveCanvas: mocks.saveCanvas,
  applyCanvas: mocks.applyCanvas
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))

const byTestid = (w: VueWrapper<any>, sel: string) => w.find(`[data-testid="${sel}"]`)

const SNAPSHOT = {
  nodes: [
    { id: 'd1', type: 'DISPATCH', position: { x: 0, y: 0 }, data: { label: 'D1' } },
    { id: 'b1', type: 'BACKEND', position: { x: 100, y: 0 }, data: { label: 'B1' } }
  ],
  edges: [{ id: 'e1', source: 'd1', target: 'b1', data: { condition_type: 'PATH', condition_value: '', priority: 1 } }]
}

/** 段二审阅样例 diff（形状 = CanvasApplyDiff，docs/api 契约 snake_case） */
const DIFF = {
  to_create: [{ label: 'DISPATCH', path: '/api/**', upstream_url: '' }],
  to_update: [{ id: 'n2', changes: { path: { from: '/a', to: '/b' } } }],
  to_delete: [{ id: 'd1', name: 'old-route' }],
  conditions_changes: 3
}

function factory() {
  const getSnapshot = vi.fn(() => ({ nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges }))
  const wrapper: VueWrapper<any> = mount(ApplyDiffDialog, {
    props: { routeId: 'r1', getSnapshot },
    global: { plugins: [ElementPlus, i18n] }
  })
  return { wrapper, getSnapshot }
}

function deferred<T = undefined>() {
  let resolve!: (v: T) => void
  let reject!: (e?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mocks.applyCanvas.mockReset()
  vi.spyOn(ElMessage, 'info').mockImplementation((() => ({})) as any)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => ({})) as any)
})

// ── i18n key 全表（v2.canvas.* 12 个，zh/en 双语存在，铁律 6）────────────────
const DIFF_KEYS = ['applyTitle', 'applyConfirm', 'applyNoDiff', 'applyFailed', 'applyLoading',
  'applyConditionsChanges', 'applyGroupCreate', 'applyGroupUpdate', 'applyGroupDelete',
  'applyDeleteTip', 'applyDescLabel', 'applyDescPlaceholder']
  .map((k) => `v2.canvas.${k}`)

describe('v2 canvas/ApplyDiffDialog — i18n key 全表双语存在（铁律 6）', () => {
  it.each(DIFF_KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 canvas/ApplyDiffDialog — 初始态', () => {
  it('未 open：cnv-diff-dialog 不渲染 + 不发任何 applyCanvas', () => {
    const { wrapper } = factory()
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
    expect(mocks.applyCanvas).not.toHaveBeenCalled()
  })
})

describe('v2 canvas/ApplyDiffDialog — 段一·预览（dry_run=true）', () => {
  it('open() → applyCanvas(r1, { nodes, edges, dry_run: true }) 恰一次 + 弹窗渲染三组 + 条件变更计数', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    expect(mocks.applyCanvas).toHaveBeenCalledTimes(1)
    expect(mocks.applyCanvas).toHaveBeenCalledWith('r1', {
      nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges, dry_run: true
    })
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-group-create').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-group-update').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-group-delete').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-conditions').text()).toContain('3')
    expect(byTestid(wrapper, 'cnv-diff-loading').exists()).toBe(false)
  })

  it('预览中（悬挂）→ cnv-diff-loading 出现 + 分组未渲染；resolve 后 loading 消失', async () => {
    const d = deferred<any>()
    mocks.applyCanvas.mockReturnValueOnce(d.promise)
    const { wrapper } = factory()
    const opening = (wrapper.vm as any).open()
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-loading').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-loading').text()).toContain(t('v2.canvas.applyLoading'))
    expect(byTestid(wrapper, 'cnv-diff-group-create').exists()).toBe(false)
    d.resolve(DIFF)
    await opening
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-loading').exists()).toBe(false)
    expect(byTestid(wrapper, 'cnv-diff-group-create').exists()).toBe(true)
  })

  it('空差异 → info toast（applyNoDiff）+ 弹窗不渲染（旧 isEmptyDiff 语义随迁）', async () => {
    mocks.applyCanvas.mockResolvedValueOnce({ to_create: [], to_update: [], to_delete: [] })
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
    expect(ElMessage.info).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining(t('v2.canvas.applyNoDiff'))
    }))
  })

  it('预览失败 → cnv-diff-error（applyFailed，不透传原始 message）+ 弹窗不渲染', async () => {
    mocks.applyCanvas.mockRejectedValueOnce(new Error('downstream-500-secret'))
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    expect(byTestid(wrapper, 'cnv-diff-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-error').text()).toContain(t('v2.canvas.applyFailed'))
    expect(byTestid(wrapper, 'cnv-diff-error').text()).not.toContain('downstream-500-secret')
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
  })
})

describe('v2 canvas/ApplyDiffDialog — 段二·审阅（diff 摘要 + 删除确认 + 变更说明）', () => {
  it('create 行含 label/path/upstream；update 行含 id + 字段名 + from → to 细节', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    const creates = wrapper.findAll('[data-testid="cnv-diff-create-row"]')
    expect(creates).toHaveLength(1)
    expect(creates[0].text()).toContain('DISPATCH')
    expect(creates[0].text()).toContain('/api/**')
    const updates = wrapper.findAll('[data-testid="cnv-diff-update-row"]')
    expect(updates).toHaveLength(1)
    expect(updates[0].text()).toContain('n2')
    expect(updates[0].text()).toContain('path')
    expect(updates[0].text()).toContain('/a')
    expect(updates[0].text()).toContain('/b')
    expect(updates[0].text()).toContain('→')
  })

  it('删除行逐条 testid + 名称 + 删除提示；勾选框默认不勾选（旧 _checked:false 随迁）', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    expect(byTestid(wrapper, 'cnv-diff-delete-row-d1').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-delete-row-d1').text()).toContain('d1')
    expect(byTestid(wrapper, 'cnv-diff-delete-row-d1').text()).toContain('old-route')
    expect(byTestid(wrapper, 'cnv-diff-group-delete').text()).toContain(t('v2.canvas.applyDeleteTip'))
    expect(byTestid(wrapper, 'cnv-diff-delete-check-d1').exists()).toBe(true)
  })

  it('变更说明输入：placeholder=applyDescPlaceholder + maxlength 200 + 每次预览重置为空', async () => {
    mocks.applyCanvas.mockResolvedValue(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    const desc = byTestid(wrapper, 'cnv-diff-desc')
    expect(desc.attributes('placeholder')).toContain(t('v2.canvas.applyDescPlaceholder'))
    expect(desc.attributes('maxlength')).toBe('200')
    await desc.setValue('第一次说明')
    await (wrapper.vm as any).open()
    expect((byTestid(wrapper, 'cnv-diff-desc').element as HTMLTextAreaElement).value).toBe('')
  })
})

describe('v2 canvas/ApplyDiffDialog — 段三·确认（dry_run=false）', () => {
  it('勾选 d1 + 填变更说明（去空格）→ applyCanvas 第二次携带 confirm_delete_ids/change_description + 关闭 + emit applied', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    await byTestid(wrapper, 'cnv-diff-delete-check-d1').trigger('click')
    await byTestid(wrapper, 'cnv-diff-desc').setValue('  勾删旧路由  ')
    await byTestid(wrapper, 'cnv-diff-confirm').trigger('click')
    await flushPromises()
    expect(mocks.applyCanvas).toHaveBeenCalledTimes(2)
    expect(mocks.applyCanvas).toHaveBeenLastCalledWith('r1', {
      nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges, dry_run: false,
      confirm_delete_ids: ['d1'], change_description: '勾删旧路由'
    })
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
    expect(wrapper.emitted('applied')).toHaveLength(1)
  })

  it('未勾选未填写 → 最小 payload（confirm_delete_ids: []，无 change_description 键，旧 H7b 随迁）', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    await byTestid(wrapper, 'cnv-diff-confirm').trigger('click')
    await flushPromises()
    expect(mocks.applyCanvas).toHaveBeenLastCalledWith('r1', {
      nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges, dry_run: false, confirm_delete_ids: []
    })
  })

  it('确认中 → cnv-diff-confirm disabled + 不提前 emit applied；成功后恢复 + 关闭 + emit applied', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const d = deferred()
    mocks.applyCanvas.mockReturnValueOnce(d.promise)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    await byTestid(wrapper, 'cnv-diff-confirm').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-confirm').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('applied')).toBeUndefined()
    d.resolve(undefined)
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-confirm').attributes('disabled')).toBeUndefined()
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
    expect(wrapper.emitted('applied')).toHaveLength(1)
  })

  it('确认失败 → cnv-diff-error（applyFailed，不透传原始 message）+ 弹窗保持打开 + 不 emit applied', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF).mockRejectedValueOnce(new Error('conflict-secret'))
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    await byTestid(wrapper, 'cnv-diff-confirm').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-error').exists()).toBe(true)
    expect(byTestid(wrapper, 'cnv-diff-error').text()).toContain(t('v2.canvas.applyFailed'))
    expect(byTestid(wrapper, 'cnv-diff-error').text()).not.toContain('conflict-secret')
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(true)
    expect(wrapper.emitted('applied')).toBeUndefined()
  })
})

describe('v2 canvas/ApplyDiffDialog — 取消（无写请求）', () => {
  it('cnv-diff-cancel → 弹窗关闭 + applyCanvas 恰 1 次（仅段一预览）+ 不 emit applied', async () => {
    mocks.applyCanvas.mockResolvedValueOnce(DIFF)
    const { wrapper } = factory()
    await (wrapper.vm as any).open()
    expect(byTestid(wrapper, 'cnv-diff-cancel').text()).toContain(t('common.cancel'))
    await byTestid(wrapper, 'cnv-diff-cancel').trigger('click')
    await flushPromises()
    expect(byTestid(wrapper, 'cnv-diff-dialog').exists()).toBe(false)
    expect(mocks.applyCanvas).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('applied')).toBeUndefined()
  })
})
