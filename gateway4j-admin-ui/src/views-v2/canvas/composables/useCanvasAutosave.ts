/**
 * S9b-C：画布自动保存 composable（契约 §4 S9 拆步「useCanvasAutosave.ts(3s 防抖+3 重试+lastSavedAt,~85)」
 * + 拆步裁决①「loadEpoch 竞态防护必须随迁」+ 旧画布 Canvas.vue L448-481（markDirty/doAutoSave）
 * + L749-752（onUnmounted）随迁，语义以 useCanvasAutosave.test.ts 头注为准。
 *
 * 与旧实现的差异（头注裁决存证）：
 * - 重试加固定 1000ms 退避（旧版无退避紧循环）；一个防抖周期内含首次至多 MAX_RETRIES=3 次调用；
 * - 卸载=丢弃不 flush（旧 onUnmounted 只 clearTimeout，旧 Canvas.unmount-autosave.test.ts 明文
 *   禁止卸载时 fire-and-forget 保存）；脏数据兜底归 Canvas 接线层的路由离开守卫；
 * - markLoaded() = loadEpoch++：作废挂起防抖 + 作废在途保存的落地结果 + dirty=false
 *   （旧 load() 尾部 dirty=false/dirtyTracking=true 语义随迁；dirtyTracking 前置门不随迁，
 *   load 途中的编辑允许进防抖，由 markLoaded 统一作废）；
 * - 成功落地需「周期未被作废 + 周期内无新编辑」才置 dirty=false（新编辑由新周期接管）。
 */
import { isRef, onUnmounted, ref, type Ref } from 'vue'
import { saveCanvas } from '@/api/routes'

/** 防抖静默期（旧画布 markDirty setTimeout(…,3000) 随迁勿改值） */
export const AUTO_SAVE_DEBOUNCE_MS = 3000
/** 重试间固定退避（v2 新增，旧版紧循环无退避） */
export const AUTO_SAVE_RETRY_DELAY_MS = 1000
/** 一个防抖周期内至多保存次数（旧 doAutoSave MAX_RETRIES=3 随迁勿改值，含首次） */
export const AUTO_SAVE_MAX_RETRIES = 3

export interface CanvasAutosaveOptions {
  routeId: Ref<string> | (() => string)
  /** Canvas.vue 传 live 数组取数器 */
  getSnapshot: () => { nodes: any[]; edges: any[] }
}

export function useCanvasAutosave(options: CanvasAutosaveOptions) {
  const idOf = () => (isRef(options.routeId) ? options.routeId.value : options.routeId())

  const dirty = ref(false)
  const saving = ref(false)
  const failed = ref(false)
  const lastSavedAt = ref<number | null>(null)

  // loadEpoch（裁决①随迁）：markLoaded 作废挂起防抖与在途保存落地
  let loadEpoch = 0
  // cycleId：markDirty/重载开启新周期时作废仍在重试退避中的旧周期
  let cycleId = 0
  // editSeq：周期内出现新编辑时，旧周期成功不再置 dirty=false（新周期接管）
  let editSeq = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let cancelBackoff: (() => void) | null = null
  // inFlight 计数：多个周期交叠时 saving 精确归零（过期周期落地不得熄灭在途新周期）
  let inFlight = 0

  function clearPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (cancelBackoff) {
      cancelBackoff()
      cancelBackoff = null
    }
  }

  function beginSave() {
    inFlight++
    saving.value = true
  }

  function endSave() {
    inFlight = Math.max(0, inFlight - 1)
    if (inFlight === 0) saving.value = false
  }

  function backoff(): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        cancelBackoff = null
        resolve()
      }, AUTO_SAVE_RETRY_DELAY_MS)
      cancelBackoff = () => {
        clearTimeout(t)
        resolve()
      }
    })
  }

  async function runSaveCycle() {
    const myEpoch = loadEpoch
    const myCycle = ++cycleId
    const seqAtStart = editSeq
    beginSave()
    let succeeded = false
    let attempts = 0
    while (attempts < AUTO_SAVE_MAX_RETRIES && myEpoch === loadEpoch && myCycle === cycleId) {
      attempts++
      try {
        await saveCanvas(idOf(), options.getSnapshot())
        if (myEpoch !== loadEpoch || myCycle !== cycleId) break
        succeeded = true
        if (editSeq === seqAtStart) dirty.value = false
        failed.value = false
        lastSavedAt.value = Date.now()
        // 重试中途成功即停（裁决②：不再发后续 attempt）
        break
      } catch {
        if (attempts < AUTO_SAVE_MAX_RETRIES && myEpoch === loadEpoch && myCycle === cycleId) {
          await backoff()
        }
      }
    }
    // 重试耗尽（旧 doAutoSave 尾部 dirty=true 随迁）；被作废的周期不动任何状态
    if (myEpoch === loadEpoch && myCycle === cycleId && !succeeded) {
      failed.value = true
      dirty.value = true
    }
    endSave()
  }

  /** 防抖重启：3s 静默后才发 saveCanvas(routeId, getSnapshot()) */
  function markDirty() {
    dirty.value = true
    failed.value = false
    editSeq++
    clearPending()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runSaveCycle()
    }, AUTO_SAVE_DEBOUNCE_MS)
  }

  /** 重新加载落地（loadEpoch++ 随迁）：作废挂起防抖 + 在途保存落地结果 + dirty=false */
  function markLoaded() {
    loadEpoch++
    cycleId++
    dirty.value = false
    clearPending()
  }

  /** 绕过防抖立即保存（显式保存用）；成功返回 true */
  async function flush(): Promise<boolean> {
    clearPending()
    const myEpoch = loadEpoch
    const myCycle = ++cycleId
    const seqAtStart = editSeq
    beginSave()
    try {
      await saveCanvas(idOf(), options.getSnapshot())
      if (myEpoch !== loadEpoch || myCycle !== cycleId || editSeq !== seqAtStart) return false
      dirty.value = false
      failed.value = false
      lastSavedAt.value = Date.now()
      return true
    } catch {
      if (myEpoch === loadEpoch && myCycle === cycleId) failed.value = true
      return false
    } finally {
      endSave()
    }
  }

  // 卸载=丢弃、不 flush（裁决①）：只作废挂起定时器与在途落地，不发起保存
  onUnmounted(() => {
    loadEpoch++
    cycleId++
    clearPending()
  })

  return { dirty, saving, failed, lastSavedAt, markDirty, markLoaded, flush }
}
