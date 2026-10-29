import { ref, onUnmounted, getCurrentInstance } from 'vue'
import { getSyncStatus } from '@/api/misc'
import type { SyncStatusResponse } from '@/api/misc'

/**
 * P1-3 发布生效确认：发布/应用画布成功后，每 1s 轮询 GET /v1/config/sync-status，
 * 直到 in_sync === true（「已生效」）或 15s 超时（「同步延迟」+ 重试按钮）。
 *
 * 终态：
 *  - synced  : available === true 且 in_sync === true
 *  - delayed : 15s 内未同步到（含 available=false 状态未知一直等待到超时），
 *              或轮询接口本身不可用（旧版后端 404 / 网络失败 → 立即降级，不空转 15s）
 *
 * 批量发布由调用方保证只 start() 一次（一个页面实例一个轮询，不要每行一个）。
 */
export type PublishSyncPhase = 'idle' | 'polling' | 'synced' | 'delayed'

export interface UsePublishSyncOptions {
  /** 轮询间隔 ms，默认 1000 */
  intervalMs?: number
  /** 总超时 ms，默认 15000 */
  timeoutMs?: number
}

export function usePublishSync(options: UsePublishSyncOptions = {}) {
  const intervalMs = options.intervalMs ?? 1000
  const timeoutMs = options.timeoutMs ?? 15000

  const phase = ref<PublishSyncPhase>('idle')
  /** 最近一次成功拿到的原始状态；available=false 时 gateway 为 null（契约） */
  const lastStatus = ref<SyncStatusResponse | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let deadline = 0
  let epoch = 0

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function poll(myEpoch: number) {
    if (myEpoch !== epoch) return
    try {
      const s = await getSyncStatus()
      if (myEpoch !== epoch) return
      lastStatus.value = s
      // available=false → gateway 状态未知，按未同步继续等，直到超时
      if (s && s.available === true && s.in_sync === true) {
        phase.value = 'synced'
        clearTimer()
        return
      }
    } catch {
      // 接口不可用（旧版 jar 404 / 网络失败）→ 按不可用降级：直接进入「同步延迟」，
      // 提供「刷新」重试，不再空转整个超时窗口
      if (myEpoch !== epoch) return
      phase.value = 'delayed'
      clearTimer()
      return
    }
    if (myEpoch !== epoch) return
    if (Date.now() >= deadline) {
      phase.value = 'delayed'
      clearTimer()
      return
    }
    timer = setTimeout(() => {
      timer = null
      void poll(myEpoch)
    }, intervalMs)
  }

  /** 发布动作成功后调用：开始一轮「发布中 → 已生效/同步延迟」轮询 */
  function start() {
    clearTimer()
    epoch += 1
    deadline = Date.now() + timeoutMs
    phase.value = 'polling'
    void poll(epoch)
  }

  /** 超时 / 降级后的手动重试：重新开始一轮完整轮询 */
  function retry() {
    start()
  }

  function dispose() {
    clearTimer()
    epoch += 1
    phase.value = 'idle'
    lastStatus.value = null
  }

  if (getCurrentInstance()) {
    onUnmounted(dispose)
  }

  return { phase, lastStatus, start, retry, dispose }
}
