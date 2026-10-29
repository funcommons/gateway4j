import { ref, onUnmounted, getCurrentInstance } from 'vue'
import { getToken } from '@/api/http'

/**
 * P2-7 监控 SSE 实时化：GET /v1/monitor/stream（EventSource，token 经 ?token= 查询参数）。
 *
 * 事件契约（固定）：
 *  - `metrics`        data = JSON 字符串：{ total, error, total_requests, ... } 摘要 → 节流应用
 *  - `config_changed` data = JSON 字符串：{ type, at } → 去抖 2s 定向刷新
 *
 * 降级链（新旧混布安全，全程静默不刷错误）：
 *  - 环境 无 EventSource / 构造抛错            → 立即 fallback('no-eventsource')
 *  - ?token= 401 / 404（连接失败，CLOSED）      → fallback('error')
 *  - onerror 但浏览器仍在自动重连（CONNECTING） → 快速失败计数超阈值后放弃，fallback('error')
 *  - fallback 后由调用方回退既有 setInterval 轮询（复用其现有加载函数，见 onFallback）
 *
 * 页面隐藏（visibilitychange → hidden）时暂停（关闭 ES / 停止节流去抖落盘），
 * 重新可见时自动重连；已降级轮询模式则交由调用方的轮询自行处理。
 */

export type MonitorStreamMode = 'idle' | 'connecting' | 'sse' | 'polling' | 'paused'

export type MonitorFallbackReason = 'no-eventsource' | 'error'

/** metrics 事件摘要载荷（Long→String 契约下数值字段可能是字符串，由调用方 Number() 归一） */
export interface MonitorStreamMetrics {
  total?: number | string
  error?: number | string
  total_requests?: number | string
  [key: string]: unknown
}

/** config_changed 事件载荷 */
export interface MonitorConfigChanged {
  type?: string
  at?: string
  [key: string]: unknown
}

export interface UseMonitorStreamOptions {
  /** SSE 端点，默认 '/v1/monitor/stream' */
  streamUrl?: string
  /** token 提供器，默认 api/http 的 getToken（Bearer 同源） */
  getToken?: () => string | null
  /** metrics 事件回调（composable 内部已按 metricsThrottleMs 节流） */
  onMetrics?: (m: MonitorStreamMetrics) => void
  /** config_changed 事件回调（composable 内部已按 configDebounceMs 去抖） */
  onConfigChanged?: (e: MonitorConfigChanged) => void
  /** SSE 放弃并降级时回调一次；调用方在此回退既有轮询 */
  onFallback?: (reason: MonitorFallbackReason) => void
  /** metrics 节流窗口 ms，默认 1000 */
  metricsThrottleMs?: number
  /** config_changed 去抖窗口 ms，默认 2000（任务契约） */
  configDebounceMs?: number
  /** CONNECTING 态快速失败放弃阈值（次），默认 3 */
  maxFastErrors?: number
  /** 快速失败计数窗口 ms，默认 15000 */
  fastErrorWindowMs?: number
}

/** 解析 SSE data：非法 JSON / 空载荷返回 null，不抛错（静默降级原则） */
export function parseStreamData<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as T) : null
  } catch {
    return null
  }
}

export function useMonitorStream(options: UseMonitorStreamOptions = {}) {
  const streamUrl = options.streamUrl ?? '/v1/monitor/stream'
  // token 缺取失败（隐私模式 / 存储被禁）不阻断订阅，静默以匿名连接（401 时走降级链）
  const getTokenFn = options.getToken ?? (() => {
    try { return getToken() } catch { return null }
  })
  const metricsThrottleMs = options.metricsThrottleMs ?? 1000
  const configDebounceMs = options.configDebounceMs ?? 2000
  const maxFastErrors = options.maxFastErrors ?? 3
  const fastErrorWindowMs = options.fastErrorWindowMs ?? 15000

  const mode = ref<MonitorStreamMode>('idle')
  const connected = ref(false)
  const lastMetrics = ref<MonitorStreamMetrics | null>(null)
  const lastConfigChange = ref<MonitorConfigChanged | null>(null)

  // EventSource 实例类型用 any 承接：jsdom / 旧环境可能无该全局，避免类型依赖
  let es: any = null
  let metricsTimer: ReturnType<typeof setTimeout> | null = null
  let metricsPending: MonitorStreamMetrics | null = null
  let metricsLastAt = 0
  let configTimer: ReturnType<typeof setTimeout> | null = null
  let configPending: MonitorConfigChanged | null = null
  let fastErrors: number[] = []
  let disposed = false
  let visibilityBound = false

  function clearTimers() {
    if (metricsTimer !== null) { clearTimeout(metricsTimer); metricsTimer = null }
    if (configTimer !== null) { clearTimeout(configTimer); configTimer = null }
  }

  /** metrics 节流：窗口内首个立即应用，末尾补一次（trailing），中间丢弃 */
  function throttledApplyMetrics(m: MonitorStreamMetrics) {
    metricsPending = m
    const now = Date.now()
    const elapsed = now - metricsLastAt
    if (elapsed >= metricsThrottleMs) {
      metricsLastAt = now
      const applied = metricsPending
      metricsPending = null
      options.onMetrics?.(applied)
      return
    }
    if (metricsTimer === null) {
      metricsTimer = setTimeout(() => {
        metricsTimer = null
        metricsLastAt = Date.now()
        const applied = metricsPending
        metricsPending = null
        if (applied) options.onMetrics?.(applied)
      }, metricsThrottleMs - elapsed)
    }
  }

  /** config_changed 去抖：窗口内只触发最后一次（定向刷新防抖 2s） */
  function debouncedFireConfigChanged(e: MonitorConfigChanged) {
    configPending = e
    if (configTimer !== null) clearTimeout(configTimer)
    configTimer = setTimeout(() => {
      configTimer = null
      const applied = configPending
      configPending = null
      if (applied) options.onConfigChanged?.(applied)
    }, configDebounceMs)
  }

  function closeEventSource() {
    if (es) {
      try { es.close() } catch { /* 静默 */ }
      es = null
    }
    connected.value = false
  }

  /** 放弃 SSE，交回调用方轮询。幂等：已降级后不再重复回调。 */
  function fallback(reason: MonitorFallbackReason) {
    if (disposed || mode.value === 'polling') return
    closeEventSource()
    mode.value = 'polling'
    options.onFallback?.(reason)
  }

  function onOpen() {
    if (disposed || !es) return
    fastErrors = []
    mode.value = 'sse'
    connected.value = true
  }

  function onMetricsEvent(e: MessageEvent) {
    if (disposed || mode.value !== 'sse') return
    const parsed = parseStreamData<MonitorStreamMetrics>(e?.data)
    if (!parsed) return
    lastMetrics.value = parsed
    throttledApplyMetrics(parsed)
  }

  function onConfigChangedEvent(e: MessageEvent) {
    if (disposed || mode.value !== 'sse') return
    const parsed = parseStreamData<MonitorConfigChanged>(e?.data)
    if (!parsed) return
    lastConfigChange.value = parsed
    debouncedFireConfigChanged(parsed)
  }

  function onError() {
    if (disposed || !es) return
    connected.value = false
    const readyState = typeof es.readyState === 'number' ? es.readyState : 2
    // CLOSED(2)：浏览器已放弃（401/404/非 event-stream 响应）→ 立即静默降级
    if (readyState === 2) {
      fallback('error')
      return
    }
    // CONNECTING(0)：浏览器原生自动重连；窗口内快速失败达到阈值即放弃（防对 401 无限静默重试）
    const now = Date.now()
    fastErrors = fastErrors.filter((t) => now - t <= fastErrorWindowMs)
    fastErrors.push(now)
    if (fastErrors.length >= maxFastErrors) {
      fallback('error')
    }
  }

  function bindVisibility() {
    if (visibilityBound || typeof document === 'undefined') return
    visibilityBound = true
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function onVisibilityChange() {
    if (disposed) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // 暂停：仅对仍在 SSE 链路上的实例关闭连接；已降级轮询的由调用方管理
      if (mode.value === 'sse' || mode.value === 'connecting') {
        closeEventSource()
        mode.value = 'paused'
      }
      return
    }
    // 重新可见：暂停中的实例自动重连；降级轮询实例交回调用方既有节奏
    if (mode.value === 'paused') {
      start()
    }
  }

  /** 建立订阅。已连接 / 已降级轮询时幂等返回。 */
  function start() {
    if (disposed || mode.value === 'sse' || mode.value === 'connecting') return
    if (mode.value === 'polling') return
    bindVisibility()
    const ES = (globalThis as any).EventSource
    if (typeof ES !== 'function') {
      // jsdom / 极旧浏览器：无 EventSource → 立即降级轮询（静默）
      fallback('no-eventsource')
      return
    }
    mode.value = 'connecting'
    const token = getTokenFn() ?? ''
    try {
      es = new ES(`${streamUrl}?token=${encodeURIComponent(token)}`)
    } catch {
      fallback('no-eventsource')
      return
    }
    es.onopen = onOpen
    es.onerror = onError
    es.addEventListener('metrics', onMetricsEvent as EventListener)
    es.addEventListener('config_changed', onConfigChangedEvent as EventListener)
  }

  /** 停止并复位到 idle（保留降级标记的调用方轮询不受影响） */
  function stop() {
    closeEventSource()
    clearTimers()
    metricsPending = null
    configPending = null
    fastErrors = []
    if (mode.value !== 'polling') mode.value = 'idle'
  }

  function dispose() {
    disposed = true
    stop()
    if (visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
    mode.value = 'idle'
  }

  if (getCurrentInstance()) {
    onUnmounted(dispose)
  }

  return { mode, connected, lastMetrics, lastConfigChange, start, stop, dispose }
}
