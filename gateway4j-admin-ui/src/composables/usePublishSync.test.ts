import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSyncStatus: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getSyncStatus: mocks.getSyncStatus
}))

import { usePublishSync } from '@/composables/usePublishSync'

function inSync(v: boolean) {
  return {
    available: true,
    gateway: { version: v ? 42 : 41, fingerprint: 'fp', updated_at: 1, instance: 'gw-1' },
    db_version: 42,
    in_sync: v
  }
}

beforeEach(() => {
  mocks.getSyncStatus.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePublishSync — P1-3 发布生效轮询', () => {
  it('初始 idle，start() 进入 polling 并立即发出第一次查询', async () => {
    mocks.getSyncStatus.mockImplementation(() => new Promise(() => {}))
    const { phase, start } = usePublishSync()
    expect(phase.value).toBe('idle')
    start()
    expect(phase.value).toBe('polling')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('终态 in_sync=true → synced（「已生效」），停止轮询', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(true))
    const { phase, start } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(0)
    expect(phase.value).toBe('synced')
    // 不会再继续轮询
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('available=false（gateway 状态未知）继续等待，随后同步 → synced', async () => {
    mocks.getSyncStatus
      .mockResolvedValueOnce({ available: false, gateway: null, db_version: 42, in_sync: false })
      .mockResolvedValueOnce({ available: false, gateway: null, db_version: 42, in_sync: false })
      .mockResolvedValue(inSync(true))
    const { phase, start } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(2500)
    expect(phase.value).toBe('synced')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(3)
  })

  it('15s 超时仍未同步 → delayed（「同步延迟」），停止轮询', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { phase, start } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(14000)
    expect(phase.value).toBe('polling')
    await vi.advanceTimersByTimeAsync(2000)
    expect(phase.value).toBe('delayed')
    const calls = mocks.getSyncStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.getSyncStatus.mock.calls.length).toBe(calls)
  })

  it('接口不可用（404/网络失败）→ 立即降级 delayed，不空转整个超时窗口', async () => {
    mocks.getSyncStatus.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    const { phase, start } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(0)
    expect(phase.value).toBe('delayed')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15000)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('delayed 后 retry() 重新开始一轮完整轮询', async () => {
    mocks.getSyncStatus.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(inSync(true))
    const { phase, start, retry } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(0)
    expect(phase.value).toBe('delayed')
    retry()
    expect(phase.value).toBe('polling')
    await vi.advanceTimersByTimeAsync(0)
    expect(phase.value).toBe('synced')
  })

  it('dispose() 回 idle 并不再轮询（组件卸载防泄漏）', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { phase, start, dispose } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(1000)
    dispose()
    expect(phase.value).toBe('idle')
    const calls = mocks.getSyncStatus.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.getSyncStatus.mock.calls.length).toBe(calls)
  })

  it('轮询间隔为 1s（契约：每 1s 一次）', async () => {
    mocks.getSyncStatus.mockResolvedValue(inSync(false))
    const { start } = usePublishSync()
    start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(2)
  })
})
