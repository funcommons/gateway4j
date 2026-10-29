import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useMonitorStream, parseStreamData } from '@/composables/useMonitorStream'

/**
 * P2-7 SSE composable 契约用例：
 *  - metrics 事件应用（节流）
 *  - config_changed 去抖 2s
 *  - 降级链：无 EventSource / 构造抛错 / onerror CLOSED（401/404 形态）/ 快速失败超阈值
 *  - visibilitychange 暂停 / 恢复
 */

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  readyState = FakeEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, Array<(e: { data?: string }) => void>>()
  closed = false

  constructor(url: string) {
    FakeEventSource.instances.push(this)
    this.url = url
  }

  addEventListener(type: string, cb: (e: { data?: string }) => void) {
    const list = this.listeners.get(type) ?? []
    list.push(cb)
    this.listeners.set(type, list)
  }

  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }

  // ---- 测试驱动 ----
  fireOpen() {
    this.readyState = FakeEventSource.OPEN
    this.onopen?.()
  }
  fireMessage(type: string, data: string) {
    for (const cb of this.listeners.get(type) ?? []) cb({ data })
  }
  fireError(readyStateAfter: number) {
    this.readyState = readyStateAfter
    this.onerror?.()
  }

  static instances: FakeEventSource[] = []
  static latest(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]
  }
  static reset() {
    FakeEventSource.instances = []
  }
}

function installES() {
  ;(globalThis as any).EventSource = FakeEventSource
}

type Stream = ReturnType<typeof useMonitorStream>

function makeStream(over: Record<string, unknown> = {}) {
  return useMonitorStream({
    getToken: () => 'TOK',
    ...over
  })
}

beforeEach(() => {
  FakeEventSource.reset()
  vi.useFakeTimers()
})

afterEach(() => {
  delete (globalThis as any).EventSource
  vi.useRealTimers()
})

describe('parseStreamData', () => {
  it('parses JSON object payloads', () => {
    expect(parseStreamData('{"a":1}')).toEqual({ a: 1 })
  })
  it('returns null for invalid JSON / non-object / empty', () => {
    expect(parseStreamData('not-json')).toBeNull()
    expect(parseStreamData('[1,2]')).toEqual([1, 2])
    expect(parseStreamData('')).toBeNull()
    expect(parseStreamData(undefined)).toBeNull()
  })
})

describe('useMonitorStream — SSE 订阅', () => {
  it('start() creates EventSource with ?token= query param and reaches sse on open', () => {
    installES()
    const s: Stream = makeStream()
    s.start()
    const es = FakeEventSource.latest()
    expect(es.url).toBe('/v1/monitor/stream?token=TOK')
    es.fireOpen()
    expect(s.mode.value).toBe('sse')
    expect(s.connected.value).toBe(true)
    s.dispose()
  })

  it('token is URL-encoded', () => {
    installES()
    const s = makeStream({ getToken: () => 'a b&c' })
    s.start()
    expect(FakeEventSource.latest().url).toBe('/v1/monitor/stream?token=a%20b%26c')
    s.dispose()
  })
})

describe('useMonitorStream — metrics 事件（节流应用）', () => {
  it('applies the first metrics event immediately and exposes lastMetrics', () => {
    installES()
    const onMetrics = vi.fn()
    const s = makeStream({ onMetrics })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireMessage('metrics', JSON.stringify({ total: '3', error: '1', total_requests: '42' }))
    expect(onMetrics).toHaveBeenCalledTimes(1)
    expect(onMetrics.mock.calls[0][0]).toEqual({ total: '3', error: '1', total_requests: '42' })
    expect(s.lastMetrics.value).toEqual({ total: '3', error: '1', total_requests: '42' })
    s.dispose()
  })

  it('throttles bursts: leading applied, intermediates dropped, trailing applied after window', () => {
    installES()
    const onMetrics = vi.fn()
    const s = makeStream({ onMetrics, metricsThrottleMs: 1000 })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireMessage('metrics', JSON.stringify({ total_requests: 1 }))
    es.fireMessage('metrics', JSON.stringify({ total_requests: 2 }))
    es.fireMessage('metrics', JSON.stringify({ total_requests: 3 }))
    // leading 已应用，中间 2/3 在窗口内被合并
    expect(onMetrics).toHaveBeenCalledTimes(1)
    expect(onMetrics.mock.calls[0][0]).toEqual({ total_requests: 1 })
    vi.advanceTimersByTime(1000)
    // trailing 补一次，值为最后一条
    expect(onMetrics).toHaveBeenCalledTimes(2)
    expect(onMetrics.mock.calls[1][0]).toEqual({ total_requests: 3 })
    s.dispose()
  })

  it('invalid JSON payload is ignored silently', () => {
    installES()
    const onMetrics = vi.fn()
    const s = makeStream({ onMetrics })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireMessage('metrics', 'not-json')
    expect(onMetrics).not.toHaveBeenCalled()
    s.dispose()
  })
})

describe('useMonitorStream — config_changed（去抖 2s）', () => {
  it('fires only the last event after the 2s debounce window', () => {
    installES()
    const onConfigChanged = vi.fn()
    const s = makeStream({ onConfigChanged })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireMessage('config_changed', JSON.stringify({ type: 'route', at: '2026-10-29T00:00:01Z' }))
    es.fireMessage('config_changed', JSON.stringify({ type: 'plugin', at: '2026-10-29T00:00:02Z' }))
    expect(onConfigChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1999)
    expect(onConfigChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onConfigChanged).toHaveBeenCalledTimes(1)
    expect(onConfigChanged.mock.calls[0][0]).toEqual({ type: 'plugin', at: '2026-10-29T00:00:02Z' })
    expect(s.lastConfigChange.value).toEqual({ type: 'plugin', at: '2026-10-29T00:00:02Z' })
    s.dispose()
  })
})

describe('useMonitorStream — 降级链', () => {
  it('no EventSource in environment → immediate silent fallback to polling', () => {
    // 故意不安装 EventSource（jsdom 默认）
    const onFallback = vi.fn()
    const s = makeStream({ onFallback })
    s.start()
    expect(s.mode.value).toBe('polling')
    expect(onFallback).toHaveBeenCalledWith('no-eventsource')
    s.dispose()
  })

  it('EventSource constructor throwing → silent fallback', () => {
    ;(globalThis as any).EventSource = class {
      constructor() {
        throw new Error('blocked')
      }
    }
    const onFallback = vi.fn()
    const s = makeStream({ onFallback })
    s.start()
    expect(s.mode.value).toBe('polling')
    expect(onFallback).toHaveBeenCalledTimes(1)
    s.dispose()
  })

  it('?token= 401/404 形态（onerror + CLOSED）→ 立即静默降级，不抛错', () => {
    installES()
    const onFallback = vi.fn()
    const s = makeStream({ onFallback })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    expect(s.mode.value).toBe('sse')
    es.fireError(FakeEventSource.CLOSED)
    expect(s.mode.value).toBe('polling')
    expect(s.connected.value).toBe(false)
    expect(onFallback).toHaveBeenCalledWith('error')
    // 静默：不向外抛任何异常
    s.dispose()
  })

  it('fallback is idempotent (repeated errors do not re-fire onFallback)', () => {
    installES()
    const onFallback = vi.fn()
    const s = makeStream({ onFallback })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireError(FakeEventSource.CLOSED)
    es.fireError(FakeEventSource.CLOSED)
    expect(onFallback).toHaveBeenCalledTimes(1)
    s.dispose()
  })

  it('CONNECTING 态快速失败超过阈值才放弃（防 401 无限静默重连）', () => {
    installES()
    const onFallback = vi.fn()
    const s = makeStream({ onFallback, maxFastErrors: 3, fastErrorWindowMs: 15000 })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireError(FakeEventSource.CONNECTING)
    es.fireError(FakeEventSource.CONNECTING)
    expect(s.mode.value).toBe('sse')
    es.fireError(FakeEventSource.CONNECTING)
    expect(s.mode.value).toBe('polling')
    expect(onFallback).toHaveBeenCalledTimes(1)
    s.dispose()
  })

  it('fast failures outside the window do not accumulate', () => {
    installES()
    const onFallback = vi.fn()
    const s = makeStream({ onFallback, maxFastErrors: 3, fastErrorWindowMs: 15000 })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    for (let i = 0; i < 5; i++) {
      es.fireError(FakeEventSource.CONNECTING)
      vi.advanceTimersByTime(16000)
    }
    expect(s.mode.value).toBe('sse')
    expect(onFallback).not.toHaveBeenCalled()
    s.dispose()
  })

  it('after fallback, start() is a no-op (polling owns the loop)', () => {
    installES()
    const s = makeStream({})
    s.start()
    FakeEventSource.latest().fireError(FakeEventSource.CLOSED)
    expect(s.mode.value).toBe('polling')
    s.start()
    expect(FakeEventSource.instances.length).toBe(1)
    s.dispose()
  })
})

describe('useMonitorStream — visibilitychange 暂停 / 恢复', () => {
  function setVisible(v: 'hidden' | 'visible') {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('hidden → closes ES and pauses; visible → reconnects with a new EventSource', () => {
    installES()
    const s = makeStream({})
    s.start()
    const es1 = FakeEventSource.latest()
    es1.fireOpen()
    expect(s.mode.value).toBe('sse')

    setVisible('hidden')
    expect(es1.closed).toBe(true)
    expect(s.mode.value).toBe('paused')
    expect(s.connected.value).toBe(false)

    setVisible('visible')
    expect(s.mode.value).not.toBe('paused')
    const es2 = FakeEventSource.latest()
    expect(es2).not.toBe(es1)
    es2.fireOpen()
    expect(s.mode.value).toBe('sse')
    s.dispose()
  })

  it('paused during hidden suppresses message handling', () => {
    installES()
    const onMetrics = vi.fn()
    const s = makeStream({ onMetrics })
    s.start()
    const es1 = FakeEventSource.latest()
    es1.fireOpen()
    setVisible('hidden')
    es1.fireMessage('metrics', JSON.stringify({ total_requests: 1 }))
    expect(onMetrics).not.toHaveBeenCalled()
    s.dispose()
  })

  it('polling fallback mode is not affected by visibility toggles', () => {
    installES()
    const s = makeStream({})
    s.start()
    FakeEventSource.latest().fireError(FakeEventSource.CLOSED)
    expect(s.mode.value).toBe('polling')
    setVisible('hidden')
    expect(s.mode.value).toBe('polling')
    setVisible('visible')
    expect(s.mode.value).toBe('polling')
    expect(FakeEventSource.instances.length).toBe(1)
    s.dispose()
  })

  it('dispose removes the visibility listener', () => {
    installES()
    const s = makeStream({})
    s.start()
    s.dispose()
    const before = FakeEventSource.instances.length
    setVisibleImpl()
    expect(FakeEventSource.instances.length).toBe(before)

    function setVisibleImpl() {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }
  })
})

describe('useMonitorStream — stop/dispose 清理', () => {
  it('stop() closes ES, clears pending throttled/debounced work', () => {
    installES()
    const onConfigChanged = vi.fn()
    const s = makeStream({ onConfigChanged })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    es.fireMessage('config_changed', JSON.stringify({ type: 'route' }))
    s.stop()
    vi.advanceTimersByTime(5000)
    expect(onConfigChanged).not.toHaveBeenCalled()
    expect(es.closed).toBe(true)
    s.dispose()
  })

  it('events after dispose are ignored', () => {
    installES()
    const onMetrics = vi.fn()
    const s = makeStream({ onMetrics })
    s.start()
    const es = FakeEventSource.latest()
    es.fireOpen()
    s.dispose()
    es.fireMessage('metrics', JSON.stringify({ total_requests: 1 }))
    expect(onMetrics).not.toHaveBeenCalled()
  })
})
