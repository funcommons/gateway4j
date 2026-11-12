import { test, expect, loginV2, writeEvidence, apiCall } from './helpers'

/**
 * S9-1 专项：⌘K 命令面板 routes 组 keyword 服务端搜索（S7-5 落地的带宽语义）。
 *
 * vitest（CommandPalette.server-keyword.test.ts）已钉死前端行为：搜索态
 * listRoutes({ keyword: q })、服务端平铺命中、客户端兜底过滤；但「服务端真的
 * 过滤了响应体」只有真实前后端握手能证——本用例用 playwright route 拦截
 * GET /v1/routes?keyword=... 的真实响应并计数，与无参全量基线对比。
 *
 * 约定：
 *  - helpers LINES 未收录独立业务线，被拦截语义属 routes 域 → shot/writeEvidence
 *    落 03-routes 截图目录；describe 带 BL-03 前缀供 lineFromTitle 失败归档同目录。
 *  - keyword 取 'internal_api'（dev 库真实分发路由：全量 200+ 行仅它命中，
 *    必命中、必缩小）；用例对 dev 库只读，无副作用。
 *  - route handler 全包 try/catch（playwright route 竞态坑：handler 抛错会让请求
 *    永久 pending 拖死用例），异常时降级 continue 放行。
 */

/** 路由树递归计数（全量为树、keyword 命中为平铺 children 恒 []，同函数公平对比） */
function countNodes(nodes: unknown): number {
  if (!Array.isArray(nodes)) return 0
  return nodes.reduce((n, r) => n + 1 + countNodes((r as { children?: unknown }).children), 0)
}

test.describe('BL-03 ⌘K 命令面板 keyword 服务端搜索（S9-1 专项）', () => {
  test('11-01 搜索态 listRoutes 携带 keyword 且服务端真实过滤响应体', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes')
    // 已知坑：登录后等 ~4s 让 token 持久化（下方 apiCall 依赖 localStorage['gw4j_token']）
    await page.waitForTimeout(4000)

    // 基线：拦截注册前直连全量（无参 listRoutes 分支，行为不变）
    const full = await apiCall(page, 'GET', '/v1/routes')
    const fullRows = countNodes(Array.isArray(full.payload) ? full.payload : (full.payload as { data?: unknown })?.data)
    expect(full.ok, '全量基线请求应成功').toBeTruthy()
    expect(fullRows, 'dev 库应有路由数据作基线').toBeGreaterThan(0)

    // route 拦截：仅 pathname 精确 /v1/routes 且带 keyword 的请求（零参全量/plugins 调用不受影响）
    const kwCalls: { url: string; rows: number }[] = []
    await page.route(
      (u) => u.pathname === '/v1/routes' && u.searchParams.has('keyword'),
      async (route) => {
        try {
          const res = await route.fetch()
          const body = await res.text()
          let rows = -1
          try { rows = countNodes(JSON.parse(body)) } catch { /* 非 JSON 保持 -1 */ }
          kwCalls.push({ url: route.request().url(), rows })
          await route.fulfill({ response: res, body })
        } catch {
          await route.continue().catch(() => {})
        }
      },
    )

    // ⌘K 打开命令面板（CommandPalette window 级监听 ⌘K/Ctrl+K），输入检索词
    await page.keyboard.press('Meta+k')
    await expect(page.getByTestId('cmd-root')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('cmd-input').fill('internal_api')

    // 200ms debounce + 网络往返：等被拦截的搜索请求落地
    await expect.poll(() => kwCalls.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('cmd-group-routes')).toBeVisible({ timeout: 10_000 })
    const routeItems = await page.locator('[data-testid^="cmd-item-route-"]').count()
    expect(routeItems, 'routes 组应渲染服务端命中项').toBeGreaterThan(0)

    const kw = kwCalls[0]
    expect(kw.url, '搜索请求应携带 keyword=internal_api').toContain('keyword=internal_api')
    expect(kw.rows, '服务端响应行数应非空（internal_api 必命中）').toBeGreaterThan(0)
    expect(kw.rows, `服务端必须真实过滤响应体（keyword ${kw.rows} 行 < 全量 ${fullRows} 行）`).toBeLessThan(fullRows)

    await shot('routes', '11-01-cmd-keyword-server-filter')
    writeEvidence('routes', '11-01-cmd-keyword-server-filter', diag,
      `keyword URL: ${kw.url}; keyword 响应行数: ${kw.rows}; 全量基线行数: ${fullRows}; routes 组命中项: ${routeItems}`)
  })
})
