import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  envelope: async <T,>(p: Promise<{ code?: number; data?: T; message?: string }>) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message || 'business error')
      return r.data as T
    }
    return r as T
  }
}))

import { getRouteTimeseries } from '@/api/misc'

beforeEach(() => {
  mocks.get.mockReset()
})

describe('api/misc.getRouteTimeseries — GET /v1/monitor/timeseries (P1-6 契约)', () => {
  it('requests the timeseries endpoint with routeId/timeRange/granularity params', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { source: 'prometheus', data_points: [] } })
    await getRouteTimeseries('r1')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get.mock.calls[0][0]).toBe('/v1/monitor/timeseries')
    expect(mocks.get.mock.calls[0][1]).toEqual({ params: { routeId: 'r1', timeRange: '1h', granularity: '1m' } })
  })

  it('passes timeRange/granularity through verbatim', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { source: 'snapshot', data_points: [] } })
    await getRouteTimeseries('r2', '6h', '5m')
    expect(mocks.get.mock.calls[0][1]).toEqual({ params: { routeId: 'r2', timeRange: '6h', granularity: '5m' } })
  })

  it('unwraps to { source, data_points } with prometheus source', async () => {
    const payload = {
      source: 'prometheus',
      data_points: [
        {
          timestamp: '2026-10-29T07:30:00Z',
          total_requests: 10, error_count: 1, error_rate: 0.1,
          avg_latency_ms: 12, p50_latency_ms: 10, p95_latency_ms: 40, p99_latency_ms: 80
        }
      ]
    }
    mocks.get.mockResolvedValue({ code: 0, data: payload })
    const res = await getRouteTimeseries('r1')
    expect(res).toEqual(payload)
    expect(res.source).toBe('prometheus')
    expect(res.data_points[0].p95_latency_ms).toBe(40)
  })

  it('accepts snapshot source (分位数与均值同口径, 由徽标说明)', async () => {
    mocks.get.mockResolvedValue({ code: 0, data: { source: 'snapshot', data_points: [] } })
    const res = await getRouteTimeseries('r1')
    expect(res.source).toBe('snapshot')
  })
})
