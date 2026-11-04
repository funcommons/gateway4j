/**
 * S3-T：src/api/v2.ts 契约测试（对应契约 §4 S3；流量聚合端点来自 §4 S2）。
 * 先红是预期 —— v2.ts 由 S3-C 按下列契约新建（本文件是唯一事实源）：
 *   fetchTrafficSummary()
 *     → envelope<RouteTrafficSummaryItem[]>(http.get('/v1/monitor/routes/traffic-summary'))
 *     字段 snake_case 原样透传不改名：route_id, route_name, path, status, hits_24h, qps,
 *     p95_latency_ms(number|null), avg_latency_ms, status_codes{c2xx,c4xx,c5xx},
 *     upstream{reachable,latency_ms}|null, source('prometheus'|'snapshot'), quantile_fallback(boolean)
 *   fetchRouteTimeseries(routeId, timeRange = '24h', granularity = '1h')
 *     → envelope(http.get('/v1/monitor/timeseries', { params: { routeId, timeRange, granularity } }))
 *       （端点与 src/api/misc.ts getRouteTimeseries 相同，v2 页面统一从 @/api/v2 取数）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  envelope: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  envelope: mocks.envelope
}))

import { fetchTrafficSummary, fetchRouteTimeseries } from '@/api/v2'

beforeEach(() => {
  mocks.get.mockReset()
  mocks.envelope.mockReset().mockImplementation(async (p: any) => {
    const r = await p
    if (r && typeof r === 'object' && 'code' in r) {
      if ((r.code ?? 0) !== 0) throw new Error(r.message ?? '业务失败')
      return r.data
    }
    return r
  })
})

describe('api/v2.fetchTrafficSummary', () => {
  it('GET /v1/monitor/routes/traffic-summary 并经 envelope 解包，snake_case 字段原样透传', async () => {
    const item = {
      route_id: 'r1', route_name: 'user_service', path: '/api/user/**', status: 'PUBLISHED',
      hits_24h: 312000, qps: 118, p95_latency_ms: null, avg_latency_ms: 12,
      status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
      upstream: null, source: 'snapshot', quantile_fallback: true
    }
    mocks.get.mockResolvedValue({ code: 0, data: [item] })
    const result: any = await fetchTrafficSummary()
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/routes/traffic-summary')
    expect(mocks.envelope).toHaveBeenCalled()
    expect(result).toEqual([item])
    expect(result[0]).not.toHaveProperty('code')
    expect(result[0].route_id).toBe('r1')
    expect(result[0].p95_latency_ms).toBeNull()
  })

  it('信封 code!=0 → 抛业务错误（不静默吞掉，供页面降级为 —）', async () => {
    mocks.get.mockResolvedValue({ code: 500, message: 'prometheus unavailable' })
    await expect(fetchTrafficSummary()).rejects.toThrow('prometheus unavailable')
  })
})

describe('api/v2.fetchRouteTimeseries', () => {
  it('GET /v1/monitor/timeseries，默认参数 24h/1h，envelope 解包 { source, data_points }', async () => {
    const data = {
      source: 'prometheus',
      data_points: [{ timestamp: '2026-11-04T00:00:00Z', total_requests: 1, error_count: 0, error_rate: 0 }]
    }
    mocks.get.mockResolvedValue({ code: 0, data })
    const result: any = await fetchRouteTimeseries('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/monitor/timeseries', {
      params: { routeId: 'r1', timeRange: '24h', granularity: '1h' }
    })
    expect(result).toEqual(data)
    expect(result.data_points).toHaveLength(1)
  })
})
