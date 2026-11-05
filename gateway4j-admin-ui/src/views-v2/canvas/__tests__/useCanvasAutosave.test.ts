/**
 * S9b-T：useCanvasAutosave 契约测试（docs/ui-v2/实施契约.md §4 S9 行拆步：
 * 「useCanvasAutosave.ts(3s 防抖+3 重试+lastSavedAt,~85)」+ 拆步裁决①「loadEpoch 竞态防护必须随迁」
 * + 旧画布 Canvas.vue L448-481（markDirty/doAutoSave）+ L749-752（onUnmounted）随迁）。
 * 先红是预期：composable 由 S9b-C 实现，落地前本文件为整文件收集失败级别的红
 * （Failed to resolve import …/composables/useCanvasAutosave，vitest + vue-tsc 同理，合规先红形态）。
 *
 * ── 公开 API 契约（S9b-C 照此实现，测试逐条对齐）──────────────────────────
 * // src/views-v2/canvas/composables/useCanvasAutosave.ts
 * export const AUTO_SAVE_DEBOUNCE_MS = 3000      // 旧画布 markDirty setTimeout(…,3000) 随迁勿改值
 * export const AUTO_SAVE_RETRY_DELAY_MS = 1000   // v2 新增：重试间固定退避（旧版紧循环无退避）
 * export const AUTO_SAVE_MAX_RETRIES = 3         // 旧画布 doAutoSave MAX_RETRIES=3 随迁勿改值
 *
 * useCanvasAutosave(options: {
 *   routeId: Ref<string> | (() => string)
 *   getSnapshot: () => { nodes: any[]; edges: any[] }   // Canvas.vue 传 live 数组取数器
 * }) => {
 *   dirty: Ref<boolean>           // 有未落库改动
 *   saving: Ref<boolean>          // 保存循环进行中
 *   failed: Ref<boolean>          // 重试耗尽仍失败（下次 markDirty 或成功后复位）
 *   lastSavedAt: Ref<number|null> // 最近一次成功自动保存时间戳（成功才更新，失败/作废不动）
 *   markDirty(): void             // 防抖重启：3s 静默后才发 saveCanvas(routeId, getSnapshot())
 *   markLoaded(): void            // loadEpoch++（拆步裁决①随迁）：作废挂起防抖 + 作废在途保存
 *                                 //   的落地结果 + dirty=false（旧 load() 尾部语义）
 *   flush(): Promise<boolean>     // 绕过防抖立即保存（显式保存用）；成功返回 true
 * }
 * 保存语义：saveCanvas(routeId, { nodes, edges })（与旧画布 doAutoSave 逐参等价）。
 *
 * ── 裁决要点（读旧实现后裁决，头注存证）──────────────────────────────────
 * ① 卸载=丢弃、不 flush：旧 Canvas.vue onUnmounted 只 clearTimeout(autoSaveTimer)；
 *    旧 Canvas.unmount-autosave.test.ts L8-14 明文禁止在 onUnmounted 里 fire-and-forget 调
 *    doAutoSave（async 卸载不等 promise，失败即静默丢数据）——v2 随迁：composable 内部
 *    onUnmounted 只作废挂起防抖定时器；脏数据兜底归 Canvas.vue 接线层的路由离开守卫
 *    （旧 onBeforeRouteLeave 语义，接线层职责，本文件不测）。
 * ② 重试=一个防抖周期内至多 3 次 saveCanvas 调用（旧 MAX_RETRIES=3 for 循环语义，含首次共 3 次），
 *    退避固定 1000ms：旧版为无退避紧循环，v2 按任务「退避可测」要求加固；测试用假时钟逐段
 *    推进验证时刻（退避未到不重发）。重试中途成功即停（不再发后续 attempt）。
 * ③ 重试耗尽：dirty 保持 true + failed=true + lastSavedAt 不动（旧 doAutoSave 尾部 dirty=true
 *    随迁）；再次 markDirty 重新进入全新防抖周期（failed 复位）。
 * ④ loadEpoch 竞态（裁决①随迁）：markLoaded() bump epoch——挂起防抖作废；在途保存完成时
 *    epoch 已过期则其成功结果不得置 lastSavedAt/不得再动 dirty（等价旧 load() 尾部
 *    dirty=false + dirtyTracking=true 的防护）。旧版 markDirty 的 dirtyTracking 前置门不随迁：
 *    load 途中的编辑允许进防抖，由 markLoaded 落地时统一作废（少一个状态位，保护等价）。
 * ⑤ 旧 FcSwitch autoSave 手动开关不随迁：契约 S9b 行未列（后续需要再加 options.enabled 扩展位）。
 *
 * ── 测试手法 ──────────────────────────────────────────────────────────────
 * vi.useFakeTimers() + vi.advanceTimersByTimeAsync 驱动（每个定时器 tick 后冲刷微任务，
 * 因此 mount 用真实时钟完成、交互期再开假时钟的时序安全）；「在途保存」用手工 resolve 的
 * deferred 承载；断言不依赖 Date 具体值（lastSavedAt 只断言 > 0 的数字）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  useCanvasAutosave,
  AUTO_SAVE_DEBOUNCE_MS,
  AUTO_SAVE_RETRY_DELAY_MS,
  AUTO_SAVE_MAX_RETRIES
} from '@/views-v2/canvas/composables/useCanvasAutosave'

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn(),
  getRoute: vi.fn(),
  saveCanvas: vi.fn(),
  applyCanvas: vi.fn()
}))

// 铁律：mock '@/api/routes' 全量导出四成员（本 composable 只应消费 saveCanvas）
vi.mock('@/api/routes', () => ({
  getCanvas: mocks.getCanvas,
  getRoute: mocks.getRoute,
  saveCanvas: mocks.saveCanvas,
  applyCanvas: mocks.applyCanvas
}))

/** 快照取数器固定返回值（断言 saveCanvas 载荷用） */
const SNAPSHOT = { nodes: [{ id: 'n1', type: 'DISPATCH' }], edges: [{ id: 'e1', source: 'n1', target: 'b1' }] }

type AutosaveApi = ReturnType<typeof useCanvasAutosave>

/** 挂真实组件实例的 harness（composable 内部 onUnmounted 需要实例作用域才能注册） */
function mountAutosave(routeId = 'r1') {
  let api!: AutosaveApi
  const idRef = ref(routeId)
  const getSnapshot = vi.fn(() => ({ nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges }))
  const harness = defineComponent({
    setup() {
      api = useCanvasAutosave({ routeId: idRef, getSnapshot })
      return () => null
    }
  })
  const wrapper: VueWrapper<any> = mount(harness)
  return { wrapper, api, getSnapshot, idRef }
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
  mocks.saveCanvas.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('v2 canvas/useCanvasAutosave — 常量随迁勿改值', () => {
  it('AUTO_SAVE_DEBOUNCE_MS=3000 / AUTO_SAVE_RETRY_DELAY_MS=1000 / AUTO_SAVE_MAX_RETRIES=3（裁决①②）', () => {
    expect(AUTO_SAVE_DEBOUNCE_MS).toBe(3000)
    expect(AUTO_SAVE_RETRY_DELAY_MS).toBe(1000)
    expect(AUTO_SAVE_MAX_RETRIES).toBe(3)
  })
})

describe('v2 canvas/useCanvasAutosave — 3s 防抖只发一次', () => {
  it('窗口内多次 markDirty → 3s 后恰一次 saveCanvas(routeId, 快照)，此后无新编辑不重发', async () => {
    const { api } = mountAutosave('r1')
    vi.useFakeTimers()
    api.markDirty()
    api.markDirty()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 1)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    expect(mocks.saveCanvas).toHaveBeenCalledWith('r1', { nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges })
    expect(api.dirty.value).toBe(false)
    // 成功后静默期不重发
    await vi.advanceTimersByTimeAsync(10 * AUTO_SAVE_DEBOUNCE_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
  })

  it('防抖重启：窗口内二次 markDirty → 计时重置，距末次编辑满 3s 才发（仍只一次）', async () => {
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(2000)
    api.markDirty()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
  })
})

describe('v2 canvas/useCanvasAutosave — 失败重试至多 3 次 + 固定退避可测（裁决②）', () => {
  it('三次全失败：恰 3 次调用（退避未到不重发），耗尽后 failed=true + dirty 保持 + lastSavedAt 不动', async () => {
    mocks.saveCanvas.mockRejectedValue(new Error('boom'))
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    // 第 1 次：防抖期满
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    // 退避未满不重发
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_RETRY_DELAY_MS - 1)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    // 第 2 次（退避期满）
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(2)
    // 第 3 次
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_RETRY_DELAY_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(3)
    // 无第 4 次（一个周期内 MAX_RETRIES=3）
    await vi.advanceTimersByTimeAsync(5 * AUTO_SAVE_RETRY_DELAY_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(3)
    expect(api.failed.value).toBe(true)
    expect(api.dirty.value).toBe(true)
    expect(api.lastSavedAt.value).toBeNull()
  })

  it('重试中途成功：恰 2 次调用 + dirty 复位 + lastSavedAt 更新 + failed 不置位，后续不重发', async () => {
    let calls = 0
    mocks.saveCanvas.mockImplementation(() => {
      calls++
      return calls < 2 ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
    })
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + AUTO_SAVE_RETRY_DELAY_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(2)
    expect(api.dirty.value).toBe(false)
    expect(api.failed.value).toBe(false)
    expect(api.lastSavedAt.value).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(5 * AUTO_SAVE_RETRY_DELAY_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(2)
  })

  it('重试耗尽后再次 markDirty → 重新进入全新防抖周期并成功（failed 复位，裁决③）', async () => {
    mocks.saveCanvas
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + AUTO_SAVE_RETRY_DELAY_MS * (AUTO_SAVE_MAX_RETRIES - 1))
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(3)
    expect(api.failed.value).toBe(true)
    // 手动重试（再次编辑/显式重发）：新周期
    api.markDirty()
    expect(api.dirty.value).toBe(true)
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(4)
    expect(api.failed.value).toBe(false)
    expect(api.lastSavedAt.value).toBeGreaterThan(0)
  })
})

describe('v2 canvas/useCanvasAutosave — 保存态与成功语义（lastSavedAt）', () => {
  it('保存中 saving=true；成功落地后 saving=false + dirty=false + lastSavedAt 更新为时间戳', async () => {
    const d = deferred()
    mocks.saveCanvas.mockReturnValue(d.promise)
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    expect(api.saving.value).toBe(true)
    d.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.saving.value).toBe(false)
    expect(api.dirty.value).toBe(false)
    expect(api.lastSavedAt.value).toBeGreaterThan(0)
  })
})

describe('v2 canvas/useCanvasAutosave — loadEpoch 竞态防护（裁决①随迁，markLoaded）', () => {
  it('markLoaded 作废挂起防抖：重新加载落地后，挂起的保存不再发出且 dirty=false', async () => {
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    api.markLoaded()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + AUTO_SAVE_RETRY_DELAY_MS * AUTO_SAVE_MAX_RETRIES)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
    expect(api.dirty.value).toBe(false)
  })

  it('markLoaded 作废在途保存的落地：过期成功结果不得置 lastSavedAt（旧 load 尾部竞态防护随迁）', async () => {
    const d = deferred()
    mocks.saveCanvas.mockReturnValue(d.promise)
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS)
    expect(api.saving.value).toBe(true)
    // 重新加载完成（epoch++），此刻旧保存仍在途
    api.markLoaded()
    expect(api.dirty.value).toBe(false)
    d.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.lastSavedAt.value).toBeNull()
    expect(api.dirty.value).toBe(false)
    expect(api.saving.value).toBe(false)
  })
})

describe('v2 canvas/useCanvasAutosave — 卸载语义（裁决①：丢弃不 flush）与 flush()', () => {
  it('卸载=丢弃：unmount 后挂起的防抖保存永不发出（旧 onUnmounted clearTimeout 随迁；兜底归路由离开守卫）', async () => {
    const { wrapper, api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + AUTO_SAVE_RETRY_DELAY_MS * AUTO_SAVE_MAX_RETRIES)
    expect(mocks.saveCanvas).not.toHaveBeenCalled()
  })

  it('flush() 绕过防抖立即保存：恰 1 次调用 + dirty 复位 + 返回 true（供显式保存接线）', async () => {
    const { api } = mountAutosave()
    vi.useFakeTimers()
    api.markDirty()
    const ok = await api.flush()
    expect(ok).toBe(true)
    expect(mocks.saveCanvas).toHaveBeenCalledTimes(1)
    expect(mocks.saveCanvas).toHaveBeenCalledWith('r1', { nodes: SNAPSHOT.nodes, edges: SNAPSHOT.edges })
    expect(api.dirty.value).toBe(false)
  })
})
