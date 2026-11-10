/**
 * S7-5 T 步（RED）：listRoutes 服务端 keyword 参数契约（消 ⌘K 面板全量拉带宽，P3 池遗留④）。
 * 纯增量：不改业务代码；api/routes.ts 存量 routes.test.ts 不动。
 *
 * ══ 契约（固化，C 步不得偏离）══
 * - 签名演进：listRoutes(params?: { tag?: string; environment?: string; keyword?: string })。
 * - 透传铁律：携带 keyword 时必须以 ?keyword= 下发（服务端 route_name/path LIKE 过滤，
 *   RouteServiceKeywordSearchTest 平铺契约对位）——含 keyword 与 tag/environment 组合态。
 * - 既有行为保留：无任何参数 → http.get('/v1/routes') 无 params（既有零参优化分支不变）。
 * - P4f 教训对位：keyword 本身无 snake_case 分叉（单词全小写），但断言钉「as-is 透传」，
 *   防实现自作主张改名（query-params.test.ts 「already snake_case」同款钉法）。
 *
 * ══ RED 机制（行为缺失型）══
 * 现实现 L61-66：`if (params?.tag || params?.environment)` 才带 params——仅携带 keyword
 * 时落入零参分支，keyword 被静默丢弃（three RED 用例：单 keyword / keyword+tag /
 * keyword+environment 均断言失败）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  envelope: <T>(p: Promise<T>) => p
}))

import { listRoutes } from '@/api/routes'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue([])
})

/**
 * RED 期签名缺口：listRoutes 形参类型尚无 keyword（本票 C 步演进项）。
 * 双断言绕过 TS2353 过量属性检查（契约 §3 基线零新增 TS 错误；断言目标锁定
 * 「C 步后的形参类型」——落地后 keyword 入型，本别名无需改动即随签名成立）。
 */
type ListRoutesParams = Parameters<typeof listRoutes>[0]
const withKeyword = (p: { keyword: string; tag?: string; environment?: string }) =>
  p as unknown as ListRoutesParams

describe('api/routes.listRoutes — 服务端 keyword 参数契约（S7-5）', () => {
  it('仅携带 keyword → ?keyword= 下发（现落入零参分支被丢弃，RED）', async () => {
    await listRoutes(withKeyword({ keyword: 'pay' }))
    expect(mocks.get).toHaveBeenCalledTimes(1)
    const [url, opts] = mocks.get.mock.calls[0]
    expect(url).toBe('/v1/routes')
    expect(opts?.params).toEqual({ keyword: 'pay' })
  })

  it('keyword 与 tag 组合 → 二者同时下发（互不挤占）', async () => {
    await listRoutes(withKeyword({ tag: 'prod', keyword: 'pay' }))
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts?.params).toEqual({ tag: 'prod', keyword: 'pay' })
  })

  it('keyword 与 environment 组合 → 二者同时下发（互不挤占）', async () => {
    await listRoutes(withKeyword({ environment: 'default', keyword: 'pay' }))
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts?.params).toEqual({ environment: 'default', keyword: 'pay' })
  })

  it('keyword as-is 透传（P4f 教训：防实现自作改名；keyword 本身无 snake_case 分叉）', async () => {
    await listRoutes(withKeyword({ keyword: 'pay/refund' }))
    const [, opts] = mocks.get.mock.calls[0]
    expect(opts?.params.keyword).toBe('pay/refund')
    expect(opts?.params).not.toHaveProperty('search')
    expect(opts?.params).not.toHaveProperty('q')
  })

  it('既有行为保留：无任何参数 → 零参调用（无 params 键），不因 keyword 演进而动', async () => {
    await listRoutes()
    expect(mocks.get).toHaveBeenCalledWith('/v1/routes')
  })
})
