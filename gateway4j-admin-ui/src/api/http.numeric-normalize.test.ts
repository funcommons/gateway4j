import { describe, it, expect } from 'vitest'
import { envelope, normalizeNumericFields, METRIC_NUMERIC_KEYS } from '@/api/http'

// P0-2: framework4j-web 契约 Long → 字符串. 监控载荷的 total_requests / error_count
// 以 "0" 到达前端, 直接 `+` 求和退化为拼接 (大盘总请求数显示 13 个 0 的根因).
// 契约: normalizeNumericFields() / envelope() 必须把监控指标数值归一为 number;
// timestamp 是 ISO-8601 字符串 (后端 Instant.toString()), 必须保持原样.

describe('normalizeNumericFields — monitor metric coercion', () => {
  it('coerces string metric fields on routes/status list items', () => {
    const list = [
      { route_id: '1', status: 'HEALTHY', total_requests: '0', error_count: '0', error_rate: 0, active_connections: '3' },
      { route_id: '2', status: 'ERROR', total_requests: '120', error_count: '7', error_rate: '0.05', active_connections: 0 }
    ]
    const out: any = normalizeNumericFields(list)
    expect(out[0].total_requests).toBe(0)
    expect(out[0].error_count).toBe(0)
    expect(out[0].active_connections).toBe(3)
    expect(out[1].total_requests).toBe(120)
    expect(out[1].error_count).toBe(7)
    expect(out[1].error_rate).toBe(0.05)
    // 归一后可直接数字求和
    expect(out.reduce((s: number, r: any) => s + r.total_requests, 0)).toBe(120)
  })

  it('coerces string metrics inside data_points container (routes/{id}/metrics)', () => {
    const payload = {
      route_id: '1',
      time_range: '1h',
      granularity: '1m',
      data_points: [
        { timestamp: '2026-10-29T07:30:00Z', total_requests: '5', error_count: '1', error_rate: 0.2 },
        { timestamp: '2026-10-29T07:31:00Z', total_requests: 8, error_count: 0, error_rate: 0 }
      ]
    }
    const out: any = normalizeNumericFields(payload)
    expect(out.data_points[0].total_requests).toBe(5)
    expect(out.data_points[0].error_count).toBe(1)
    expect(out.data_points[1].total_requests).toBe(8)
    // timestamp 保持 ISO 字符串, 不被 Number 化
    expect(out.data_points[0].timestamp).toBe('2026-10-29T07:30:00Z')
  })

  it('keeps non-numeric string metric values (no NaN corruption)', () => {
    const out: any = normalizeNumericFields({ total_requests: 'abc', error_count: '' })
    expect(out.total_requests).toBe('abc')
    expect(out.error_count).toBe('')
  })

  it('is idempotent for numeric values', () => {
    const payload = { total_requests: 3, error_count: 0, error_rate: 0.5 }
    expect(normalizeNumericFields(payload)).toEqual(payload)
  })

  it('passes through non-metric payloads untouched', () => {
    expect(normalizeNumericFields(null)).toBeNull()
    expect(normalizeNumericFields('str')).toBe('str')
    expect(normalizeNumericFields({ id: 1, name: 'x', records: [], total: '11' })).toEqual({
      id: 1, name: 'x', records: [], total: '11'
    })
  })

  it('exports the canonical metric keys (timestamp deliberately excluded)', () => {
    expect(METRIC_NUMERIC_KEYS).toContain('total_requests')
    expect(METRIC_NUMERIC_KEYS).toContain('error_count')
    expect(METRIC_NUMERIC_KEYS).toContain('error_rate')
    expect(METRIC_NUMERIC_KEYS).toContain('active_connections')
    expect(METRIC_NUMERIC_KEYS).not.toContain('timestamp')
  })
})

describe('envelope() — metric normalization wiring on dashboard data paths', () => {
  it('normalizes routes/status list inside envelope data', async () => {
    const out: any = await envelope(
      Promise.resolve({
        code: 0,
        data: [{ route_id: '1', status: 'HEALTHY', total_requests: '4', error_count: '2', error_rate: 0.5 }]
      })
    )
    expect(out[0].total_requests).toBe(4)
    expect(out[0].error_count).toBe(2)
  })

  it('normalizes metrics data_points inside envelope data', async () => {
    const out: any = await envelope(
      Promise.resolve({
        code: 0,
        data: {
          route_id: '1',
          data_points: [{ timestamp: '2026-10-29T07:30:00Z', total_requests: '9', error_count: '0', error_rate: 0 }]
        }
      })
    )
    expect(out.data_points[0].total_requests).toBe(9)
    expect(out.data_points[0].timestamp).toBe('2026-10-29T07:30:00Z')
  })

  it('leaves paginated payloads (records shape) metric-free and untouched', async () => {
    const out: any = await envelope(
      Promise.resolve({ code: 0, data: { records: [{ id: '1' }], total: '11' } })
    )
    expect(out.total).toBe(11)
    expect(out.records).toEqual([{ id: '1' }])
  })
})
