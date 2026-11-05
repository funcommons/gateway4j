/**
 * S11b-T (1/3)：POST /v1/v2/debug/replay API 封装契约测试。
 * SUT = src/api/debug.ts（S11b-C 新建；本文件先红是预期 —— 模块缺失 = Failed to resolve import）。
 * 先例：src/api/routes.test.ts（vi.hoisted + mock '@/api/http'，扁平文件命名跟随 api 层惯例）。
 *
 * 与 routes.test.ts 的刻意差异：envelope 保留真实实现（importOriginal 只打桩 http 五动词）——
 * 因为 S11b 页面的 10601/10607 错误态语义就落在「信封 code≠0 → envelope 抛 BusinessError」上，
 * pass-through envelope 会把这一层契约放走。
 *
 * ── 后端事实（S11a 已提交 baa8bc7，已对源码核实）────────────────────────────
 * - V2DebugController：@PostMapping("/replay")，@RequestParam("route_id") Long routeId
 *   （必填）+ @RequestBody V2DebugReplayRequest（record(path, method, headers, query, body)，
 *   body 可 null；routeId 不在 body —— 只能走 URL 查询参数）。
 * - DebugReplayService.validateRoute：routeId==null 或路由不存在或非 PUBLISHED
 *   → BusinessException(ROUTE_NOT_FOUND=10601)。
 *   【裁决】Spring 对「查询参数缺失」回的是非信封 400（前端拿不到 10601 业务码），
 *   而空串对 Long 型 @RequestParam 会转换成 null → 稳定走 validateRoute(null) → 10601。
 *   故封装契约钉死：route_id 参数【恒传】，未选路由传空串。
 * - 网关不可达 / connect 1s / read 3s 超时 → BusinessException(SERVICE_UNAVAILABLE=10607)。
 * - 成功 data（snake_case 五键）：{ simulate, status, latency_ms, headers, body }；
 *   body >64KB 截为 65536 字符前缀（DebugReplayService.MAX_BODY_CHARS=64*1024），
 *   【无截断标记字段】—— 前端截断语义裁决见 DebugConsole.test.ts 头注。
 * - simulate 段 = RouteSimulateService.simulate 原样内嵌：
 *   { matched, route{id,route_name,route_type,path,upstream_url}|null, evaluated[],
 *     dispatch?(仅 DISPATCH 命中), plugins{global_pre,route,global_post}, request{path,method} }。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 提升到 import 之上，其引用的顶层变量必须 vi.hoisted（routes.test.ts 同款基座）
const mocks = vi.hoisted(() => {
  const get = vi.fn()
  const post = vi.fn()
  const put = vi.fn()
  const patch = vi.fn()
  const del = vi.fn()
  return { get, post, put, patch, del }
})

// 保留真实 envelope / BusinessError / 归一层，仅打桩 axios 实例
vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/http')>()
  return {
    ...actual,
    http: {
      get: mocks.get,
      post: mocks.post,
      put: mocks.put,
      patch: mocks.patch,
      delete: mocks.del
    }
  }
})

// Import after mocking so the SUT picks up the stub.
import * as debug from '@/api/debug'
import { BusinessError } from '@/api/http'

/** 请求体五分量（与后端 V2DebugReplayRequest record 一一同形） */
const PAYLOAD = {
  path: '/api/users/1',
  method: 'POST',
  headers: { 'X-Debug': '1' },
  query: { uid: '9' },
  body: '{"k":1}'
}

/** 成功 data 五键（snake_case；形状见头注「后端事实」） */
function replayData() {
  return {
    simulate: {
      matched: true,
      route: { id: '5001', route_name: '用户服务分发', route_type: 'DISPATCH', path: '/api/u/**', upstream_url: '' },
      evaluated: [
        { route_id: '5001', route_name: '用户服务分发', route_type: 'DISPATCH', matched: true, path_matched: true, reason: 'path 匹配且排序最前（命中）' }
      ],
      plugins: { global_pre: [], route: [], global_post: [] },
      request: { path: '/api/users/1', method: 'POST' }
    },
    status: 200,
    latency_ms: 37,
    headers: { 'Content-Type': 'application/json' },
    body: '{"ok":true}'
  }
}

function envelopeOk() {
  return { code: 0, message: 'ok', data: replayData() }
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.post.mockReset()
  mocks.put.mockReset()
  mocks.patch.mockReset()
  mocks.del.mockReset()
})

describe('debug api — URL / params / body 形状', () => {
  it('debugReplay(routeId, payload) → POST /v1/v2/debug/replay，body 五分量原样，route_id 走 params', async () => {
    mocks.post.mockResolvedValue(envelopeOk())
    await debug.debugReplay('5001', PAYLOAD)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith('/v1/v2/debug/replay', PAYLOAD, { params: { route_id: '5001' } })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('未选路由：route_id 恒传空串（Spring 空串→null Long → 稳定 10601 业务信封，而非非信封 400）', async () => {
    mocks.post.mockResolvedValue(envelopeOk())
    await debug.debugReplay(null, PAYLOAD)
    expect(mocks.post).toHaveBeenCalledWith('/v1/v2/debug/replay', PAYLOAD, { params: { route_id: '' } })
  })

  it('空 headers/query 原样传空对象，body=null 原样传 null（后端 record 允许，按无请求体处理）', async () => {
    mocks.post.mockResolvedValue(envelopeOk())
    const minimal = { path: '/api/u', method: 'GET', headers: {}, query: {}, body: null }
    await debug.debugReplay('5001', minimal)
    expect(mocks.post).toHaveBeenCalledWith('/v1/v2/debug/replay', minimal, { params: { route_id: '5001' } })
  })
})

describe('debug api — envelope 处理与业务错误透出', () => {
  it('code=0 → envelope 解包 data（simulate/status/latency_ms/headers/body 五键直通）', async () => {
    const data = replayData()
    mocks.post.mockResolvedValue({ code: 0, message: 'ok', data })
    await expect(debug.debugReplay('5001', PAYLOAD)).resolves.toEqual(data)
  })

  it('code=10601（路由不存在/非 PUBLISHED）→ rejects BusinessError 且 err.code===10601', async () => {
    mocks.post.mockResolvedValue({ code: 10601, message: '路由未找到', data: null })
    const err = await debug.debugReplay('9999', PAYLOAD).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BusinessError)
    expect((err as BusinessError).code).toBe(10601)
    expect((err as BusinessError).message).toBe('路由未找到')
  })

  it('code=10607（网关不可达/connect 1s/read 3s 超时）→ rejects BusinessError 且 err.code===10607', async () => {
    mocks.post.mockResolvedValue({ code: 10607, message: '后端服务不可用', data: null })
    const err = await debug.debugReplay('5001', PAYLOAD).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BusinessError)
    expect((err as BusinessError).code).toBe(10607)
  })

  it('封装只透传，不吞错不改码：10601/10607 的 message 原样可读（页面按 code 分文案）', async () => {
    mocks.post.mockResolvedValue({ code: 10607, message: '后端服务不可用', data: null })
    const err = await debug.debugReplay('5001', PAYLOAD).catch((e: unknown) => e)
    expect((err as BusinessError).message).toBe('后端服务不可用')
  })
})
