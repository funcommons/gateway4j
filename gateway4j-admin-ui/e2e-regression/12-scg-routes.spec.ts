import { execFileSync } from 'child_process'
import { test, expect, loginV2, shot, writeEvidence, uniq, apiCall, confirmPublishV2 } from './helpers'

/**
 * BL-12 路由 SCG 批量创建主链路（S12-8a，2026-11-23）
 *
 * 被测页面：/v2/routes/new = ScgRoutesForm.vue（S12-7c，纯 SCG RouteDefinition 列表编辑器，
 * 表单 ⇄ YAML 双视图），提交通道 = POST /v1/routes/batch（S12-7b，契约 docs/API_CONTRACT.md §19.1）。
 *
 * 链路：填两条路由（A：双谓词 + filter + order + metadata；B：单谓词）→ YAML 视图逐字段可见
 * → 切回表单数据不丢 → 提交（断言 POST /v1/routes/batch 真实发出 + DRAFT 引导条 + 不自动跳转）
 * → 列表页发布 A → curl 9300 真实流量（Host 谓词命中 200 + 上游回显；错 Host 404 = AND 语义）
 * → 落库形态断言（§19.1.3 映射：Path= 抽取落 gw_route.path、其余谓词落 gw_route_predicate、
 *   filter 落 gw_route_filter、metadata 落 JSONB）→ afterAll 清理 A/B（含谓词/filter 孤儿行，
 *   RouteService#deleteRoute 现不级联这两张表，见 DATABASE_DESIGN.md §5.15/§5.16）。
 *
 * mock 上游：复用既有 mock_dingtalk.py 的 upstream 形态（127.0.0.1:8091，回显
 * "UPSTREAM OK {path}"，S12-5 实播同款），跑批前置起（e2e 环境已常驻）。
 *
 * 既有 e2e 基线不重启 9300/9301/9302，全部断言针对运行中的新 jar（含 batch API + SCG filters）。
 */

const ROUTE_A = uniq('e2e_scg_a')
const ROUTE_B = uniq('e2e_scg_b')
const UPSTREAM = 'http://127.0.0.1:8091'
const GATEWAY = 'http://localhost:9300'
const PATH_A = '/scge2e/**'
const PATH_B = '/scge2e-b/**'
const HOST_PREDICATE = 'Host=scg-e2e.test'
const FILTER_A = 'AddRequestHeader=X-E2E, hello'
const METADATA_A = '{"team":"e2e"}'
const E2E_TRAFFIC_PATH = '/scge2e/e2e-traffic'

/** psql 单条查询（-t -A 裸输出；多行结果按 \n 分隔，空结果 = ''） */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', 'pg-17', 'psql', '-U', 'admin', '-d', 'gateway4j', '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  ).trim()
}

/** curl 网关 9300：返回 {status, body}（两条 curl，status 走 -w %{http_code}） */
function curlGateway(path: string, host: string): { status: string; body: string } {
  const status = execFileSync(
    'curl',
    ['-s', '-m', '10', '-o', '/dev/null', '-w', '%{http_code}', '-H', `Host: ${host}`, `${GATEWAY}${path}`],
    { encoding: 'utf8' }
  )
  const body = execFileSync(
    'curl',
    ['-s', '-m', '10', '-H', `Host: ${host}`, `${GATEWAY}${path}`],
    { encoding: 'utf8' }
  )
  return { status, body }
}

/** curl 管理面 9301（Bearer token）；返回解析后的 JSON 信封 */
function curlAdmin(method: string, path: string, token: string, body?: unknown): any {
  const args = ['-s', '-m', '15', '-X', method, '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json']
  if (body !== undefined) args.push('-d', JSON.stringify(body))
  args.push(`http://localhost:9301${path}`)
  const out = execFileSync('curl', args, { encoding: 'utf8' })
  try { return JSON.parse(out) } catch { return out }
}

/** 路由树递归按名找节点（v2 列表接口返回嵌套 children；与 03-routes 同款） */
function findRouteNode(nodes: unknown, name: string): { id: string } | null {
  for (const n of (Array.isArray(nodes) ? nodes : []) as Array<{ id: unknown; route_name: string; children?: unknown }>) {
    if (n.route_name === name) return { id: String(n.id) }
    const hit = findRouteNode(n.children, name)
    if (hit) return hit
  }
  return null
}

test.describe('BL-12 路由 SCG 批量创建（S12-8a）', () => {

  test('12-01 新建页加载：SCG 路由列表编辑器骨架（全局批次区 + 一条空路由 + 双视图切换器）', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes/new')
    await expect(page.getByTestId('scg-root')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('scg-form-view'), '缺省应为表单视图').toBeVisible({ timeout: 15_000 })
    // 全局批次区：environment 缺省 default
    await expect(page.getByTestId('scg-environment')).toHaveValue('default')
    // 路由列表区：一条空路由骨架（六字段形态），无谓词/过滤器行
    await expect(page.getByTestId('scg-route-0')).toBeVisible()
    await expect(page.getByTestId('scg-name-0')).toHaveValue('')
    await expect(page.getByTestId('scg-uri-0')).toHaveValue('')
    await expect(page.getByTestId('scg-pred-row-0-0')).toHaveCount(0)
    await expect(page.getByTestId('scg-filter-row-0-0')).toHaveCount(0)
    // 双视图切换器：表单态 aria-pressed=true
    await expect(page.getByTestId('scg-view-form')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('scg-view-yaml')).toBeVisible()
    await shot('scg', '12-01-new-page-skeleton')
    writeEvidence('scg', '12-01-new-page-skeleton', diag, '/v2/routes/new = ScgRoutesForm（S12-7c）：环境缺省 default + 一条空路由 + 表单/YAML 切换器在位')
  })

  test('12-02 双视图同步 + 批量提交：YAML 含 spring.cloud.gateway.routes 且逐字段可见，切回表单数据不丢，提交出 DRAFT 引导条且不自动跳转', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes/new')
    await expect(page.getByTestId('scg-root')).toBeVisible({ timeout: 20_000 })

    // ── 路由 A（route 0）：name/uri/双谓词/单 filter/order/metadata ──
    await page.getByTestId('scg-name-0').fill(ROUTE_A)
    await page.getByTestId('scg-uri-0').fill(UPSTREAM)
    await page.getByTestId('scg-add-pred-0').click()
    // SCG 定义串形态：`Path=<pattern>`（Path= 前缀是定义串的一部分，别只填 pattern）
    await page.getByTestId('scg-pred-0-0').fill(`Path=${PATH_A}`)
    await page.getByTestId('scg-add-pred-0').click()
    await page.getByTestId('scg-pred-0-1').fill(HOST_PREDICATE)
    await page.getByTestId('scg-add-filter-0').click()
    await page.getByTestId('scg-filter-0-0').fill(FILTER_A)
    await page.getByTestId('scg-order-0').fill('10')
    await page.getByTestId('scg-metadata-0').fill(METADATA_A)
    await page.getByTestId('scg-remark').fill('S12-8a E2E 批量建路由')
    await page.getByTestId('scg-tags').fill('e2e')

    // ── 路由 B（route 1，添加路由按钮出新行）：单谓词 ──
    await page.getByTestId('scg-add-route').click()
    await expect(page.getByTestId('scg-route-1')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('scg-name-1').fill(ROUTE_B)
    await page.getByTestId('scg-uri-1').fill(UPSTREAM)
    await page.getByTestId('scg-add-pred-1').click()
    await page.getByTestId('scg-pred-1-0').fill(`Path=${PATH_B}`)
    await shot('scg', '12-02-form-filled', true)

    // ── 表单 → YAML：spring.cloud.gateway.routes 形态，逐字段可见 ──
    await page.getByTestId('scg-view-yaml').click()
    await expect(page.getByTestId('scg-yaml-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scg-yaml-error'), '合法表单切 YAML 不应报解析错').toHaveCount(0)
    // FcYamlEditor 三形态恒有真实 textarea[data-testid=yde-content] 镜像（ready 态 display:none
    // 但 value 持续同步）→ 读 inputValue 免受 CodeMirror 视口虚拟化影响
    const yaml = await page.getByTestId('yde-content').inputValue()
    await shot('scg', '12-02-yaml-view', true)
    for (const frag of [
      'spring:', 'cloud:', 'gateway:', 'routes:',
      `id: ${ROUTE_A}`, `id: ${ROUTE_B}`,
      '127.0.0.1:8091',
      `Path=${PATH_A}`, HOST_PREDICATE, 'AddRequestHeader=X-E2E',
      'order: 10', 'team: e2e',
    ] as const) {
      expect(yaml, `YAML 应含「${frag}」（spring.cloud.gateway.routes 形态逐字段可见）`).toContain(frag)
    }

    // ── YAML → 表单：切回后数据不丢 ──
    await page.getByTestId('scg-view-form').click()
    await expect(page.getByTestId('scg-form-view')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scg-name-0')).toHaveValue(ROUTE_A)
    await expect(page.getByTestId('scg-uri-0')).toHaveValue(UPSTREAM)
    await expect(page.getByTestId('scg-pred-0-0')).toHaveValue(`Path=${PATH_A}`)
    await expect(page.getByTestId('scg-pred-0-1')).toHaveValue(HOST_PREDICATE)
    await expect(page.getByTestId('scg-filter-0-0')).toHaveValue(FILTER_A)
    await expect(page.getByTestId('scg-order-0')).toHaveValue('10')
    // metadata 经 YAML 往返后以 JSON.stringify(,2) 文本回填 → 压平空白比对
    const metaBack = (await page.getByTestId('scg-metadata-0').inputValue()).replace(/\s+/g, ' ').trim()
    expect(metaBack, 'metadata 往返后应保留键值').toBe('{ "team": "e2e" }')
    await expect(page.getByTestId('scg-name-1')).toHaveValue(ROUTE_B)
    await expect(page.getByTestId('scg-uri-1')).toHaveValue(UPSTREAM)
    await expect(page.getByTestId('scg-pred-1-0')).toHaveValue(`Path=${PATH_B}`)
    await expect(page.getByTestId('scg-order-1')).toHaveValue('0')
    await expect(page.getByTestId('scg-remark')).toHaveValue('S12-8a E2E 批量建路由')
    await expect(page.getByTestId('scg-tags')).toHaveValue('e2e')

    // ── 提交：POST /v1/routes/batch 真实发出 → DRAFT 引导条 + 不自动跳转 ──
    await page.getByTestId('scg-submit').click()
    await expect(page.getByTestId('scg-success'), '提交成功应出现 DRAFT 引导条').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scg-success')).toContainText('DRAFT')
    await expect(page.getByTestId('scg-goto-list'), '引导条应带「前往路由列表发布」按钮').toBeVisible()
    await expect(page.getByTestId('scg-error'), '不应出现前端校验错误条').toHaveCount(0)
    await expect(page.getByTestId('scg-submit-error'), '不应出现提交失败错误条').toHaveCount(0)
    // 等 1.5s 再钉 URL：若存在自动跳转，此处必然翻车（S12-7c 契约 = 停留页内引导）
    await page.waitForTimeout(1500)
    await expect(page, '提交成功后必须停留 /v2/routes/new（不自动跳转）').toHaveURL(/\/v2\/routes\/new$/)
    await shot('scg', '12-02-submitted-draft-guide', true)
    const batchCalls = diag.apiCalls.filter(c => c.includes('/v1/routes/batch'))
    writeEvidence('scg', '12-02-submit-batch-api', diag,
      `路由 A=${ROUTE_A} / B=${ROUTE_B}；POST /v1/routes/batch 调用记录=${batchCalls.length} 条；` +
      `提交后 URL=${page.url()}（未跳转）`)
    expect(batchCalls.length, '表单提交应真实发出 POST /v1/routes/batch（S12-7b）').toBeGreaterThan(0)
  })

  test('12-03 发布路由 A → 真实流量：Host 命中 200 且含上游回显，错 Host 404（谓词 AND）', async ({ page, shot, diag }) => {
    test.setTimeout(180_000) // 发布 + 网关配置重载 + 流量重试的预算
    await loginV2(page, '/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1000)

    // ── 列表页发布 A：行展开区 act-publish → /v2/publish/:id → 确认 ──
    const search = page.getByLabel('搜路径 / 名称…')
    await search.fill(ROUTE_A)
    await page.waitForTimeout(900)
    const row = page.locator('[data-testid^="route-row-"]').filter({ hasText: ROUTE_A })
    await expect(row, '批量创建的 A 应出现在路由列表').toBeVisible({ timeout: 10_000 })
    await row.locator('[data-testid^="route-expand-"]').click()
    const detail = page.locator('[data-testid^="route-detail-"]')
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.getByTestId('act-publish').click()
    await page.waitForURL(/\/v2\/publish\//, { timeout: 15_000 })
    await shot('scg', '12-03-publish-page')
    await confirmPublishV2(page, 'S12-8a E2E 发布路由 A')
    await page.waitForTimeout(2500)

    // ── 回列表核实状态真变 PUBLISHED ──
    await page.goto('/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('搜路径 / 名称…').fill(ROUTE_A)
    await page.waitForTimeout(900)
    const rowAfter = page.locator('[data-testid^="route-row-"]').filter({ hasText: ROUTE_A })
    await expect(rowAfter.locator('[data-testid="route-status"]'), '发布后状态应为「已发布」').toContainText('已发布', { timeout: 15_000 })
    await shot('scg', '12-03-published-status')

    // ── 真实流量：发布 → 网关重载（Redis 广播）需要一点时间 → 轮询重试 ──
    let hit: { status: string; body: string } = { status: '000', body: '' }
    for (let attempt = 1; attempt <= 15; attempt++) {
      hit = curlGateway(E2E_TRAFFIC_PATH, 'scg-e2e.test')
      if (hit.status === '200' && hit.body.includes(`UPSTREAM OK ${E2E_TRAFFIC_PATH}`)) break
      await page.waitForTimeout(2000)
    }
    await shot('scg', '12-03-traffic-hit')
    writeEvidence('scg', '12-03-traffic-evidence', diag,
      `GET ${E2E_TRAFFIC_PATH}（Host: scg-e2e.test）→ status=${hit.status}; body 片段=${hit.body.slice(0, 120)}`)
    expect(hit.status, 'Host 命中应返回 200').toBe('200')
    expect(hit.body, '响应应含 8091 mock 上游回显（UPSTREAM OK + 原路径）').toContain(`UPSTREAM OK ${E2E_TRAFFIC_PATH}`)

    // ── 负例：Host 不匹配 → 404（Path ∧ Host 的 AND 语义由 SCG 谓词保证）──
    const miss = curlGateway(E2E_TRAFFIC_PATH, 'no-such-host.e2e.invalid')
    writeEvidence('scg', '12-03-traffic-miss', diag,
      `错 Host 请求 → status=${miss.status}; body=${miss.body.slice(0, 80)}`)
    expect(miss.status, '错 Host 应 404（路由不被选中）').toBe('404')
  })

  test('12-04 落库形态断言（契约 §19.1.3 映射）：Path= 抽取 / 谓词行 / filter 行 / metadata JSONB / order', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })

    const tree = await apiCall(page, 'GET', '/v1/routes')
    const nodes = tree.payload ?? tree.payload?.data
    const idA = findRouteNode(nodes, ROUTE_A)?.id ?? ''
    const idB = findRouteNode(nodes, ROUTE_B)?.id ?? ''
    expect(idA, 'A 应已在库（12-02 批量创建）').not.toBe('')
    expect(idB, 'B 应已在库（12-02 批量创建）').not.toBe('')

    // ── gw_route 行：uri/path/status/sort_order/metadata/route_type ──
    const routeRows = psql(
      `SELECT route_name || '|' || route_type || '|' || upstream_url || '|' || COALESCE(path, '') || '|' || status || '|' || sort_order || '|' || metadata::text ` +
      `FROM gw_route WHERE route_name IN ('${ROUTE_A}', '${ROUTE_B}') ORDER BY route_name`
    )
    const byName = new Map(routeRows.split('\n').filter(Boolean).map(l => [l.split('|')[0]!, l] as const))
    const rowA = byName.get(ROUTE_A)
    const rowB = byName.get(ROUTE_B)
    await shot('scg', '12-04-db-rows')
    writeEvidence('scg', '12-04-db-rows', diag, `gw_route 行:\n${routeRows}`)

    // A：Path= 抽取落 path 列；uri 原样落 upstream_url；order 落 sort_order；metadata 落 JSONB
    expect(rowA, 'A 的 gw_route 行应存在').toBeTruthy()
    const [, typeA, uriA, pathA, statusA, orderA, metaA] = rowA!.split('|')
    expect(typeA).toBe('BACKEND')
    expect(uriA, 'uri → gw_route.upstream_url 原样').toBe(UPSTREAM)
    expect(pathA, 'Path= 谓词被抽取落 gw_route.path（不落谓词行）').toBe(PATH_A)
    expect(statusA, '12-03 已发布 → status=PUBLISHED').toBe('PUBLISHED')
    expect(orderA, 'order → gw_route.sort_order').toBe('10')
    expect(metaA!.replace(/\s+/g, ''), 'metadata → JSONB（{"team":"e2e"}）').toBe('{"team":"e2e"}')

    // B：单谓词（Path= 抽取后无谓词行）、无 filter、order 缺省 0、metadata 缺省 {}
    expect(rowB, 'B 的 gw_route 行应存在').toBeTruthy()
    const [, typeB, uriB, pathB, statusB, orderB, metaB] = rowB!.split('|')
    expect(typeB).toBe('BACKEND')
    expect(uriB).toBe(UPSTREAM)
    expect(pathB).toBe(PATH_B)
    expect(statusB, '未发布的 B 应保持 DRAFT').toBe('DRAFT')
    expect(orderB).toBe('0')
    expect(metaB!.replace(/\s+/g, ''), '未携带 metadata → 缺省 {}').toBe('{}')

    // ── gw_route_predicate：仅 A 的 Host 谓词一行（sort_order 从 0 递增）──
    const predRows = psql(
      `SELECT route_id || '|' || definition || '|' || sort_order FROM gw_route_predicate ` +
      `WHERE route_id IN (${idA}, ${idB}) ORDER BY route_id, sort_order`
    )
    writeEvidence('scg', '12-04-predicate-rows', diag, `gw_route_predicate 行:\n${predRows || '(无)'}`)
    expect(predRows.split('\n').filter(Boolean), '谓词行应恰为 A 的 Host 一行').toEqual([`${idA}|${HOST_PREDICATE}|0`])

    // ── gw_route_filter：仅 A 的 AddRequestHeader 一行（sort_order = 数组下标）──
    const filterRows = psql(
      `SELECT route_id || '|' || definition || '|' || sort_order FROM gw_route_filter ` +
      `WHERE route_id IN (${idA}, ${idB}) ORDER BY route_id, sort_order`
    )
    writeEvidence('scg', '12-04-filter-rows', diag, `gw_route_filter 行:\n${filterRows || '(无)'}`)
    expect(filterRows.split('\n').filter(Boolean), 'filter 行应恰为 A 的 AddRequestHeader 一行').toEqual([`${idA}|${FILTER_A}|0`])
  })

  test.afterAll(async () => {
    // ── 清理：A（先下线再删，PUBLISHED 不可直删）+ B（DRAFT 直删）+ 谓词/filter 孤儿行 ──
    // RouteService#deleteRoute 现不级联 gw_route_predicate / gw_route_filter
    // （DATABASE_DESIGN.md §5.15「已知实现缺口」同款），孤儿行由 psql 兜底清除。
    const diag = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], apiCalls: [] }
    const notes: string[] = []
    try {
      const loginRaw = execFileSync('curl', ['-s', '-m', '15', '-X', 'POST',
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({ username: 'admin', password: 'admin123' }),
        'http://localhost:9301/v1/auth/login'], { encoding: 'utf8' })
      const login = JSON.parse(loginRaw)
      const token = login?.access_token ?? login?.data?.access_token
      expect(token, '清理前置：admin 登录应拿到 access_token').toBeTruthy()

      const list = curlAdmin('GET', '/v1/routes', token)
      const nodes = list?.data ?? list
      const touched: string[] = []
      for (const [name, ] of [[ROUTE_A], [ROUTE_B]] as const) {
        const node = findRouteNode(nodes, name)
        if (!node) { notes.push(`${name}: 未找到（12-02 未落库，跳过）`); continue }
        touched.push(node.id)
        let del = curlAdmin('DELETE', `/v1/routes/${node.id}`, token)
        if (del?.success === false) {
          // PUBLISHED 不可直删 → 先下线再删
          const off = curlAdmin('POST', `/v1/routes/${node.id}/offline`, token)
          notes.push(`${name}: 直删被拒（success=false）→ offline=${JSON.stringify(off).slice(0, 80)} → 重删`)
          del = curlAdmin('DELETE', `/v1/routes/${node.id}`, token)
        }
        notes.push(`${name}: DELETE success=${del?.success !== false} (id=${node.id})`)
      }
      // 谓词 / filter 孤儿行兜底清除：deleteRoute 不级联这两张表（DATABASE_DESIGN.md §5.15
      // 「已知实现缺口」同款），且 gw_route 行删掉后按名已反查不到 → 必须用删除前捕获的 id
      const orphanPred = touched.length ? psql(`DELETE FROM gw_route_predicate WHERE route_id IN (${touched.join(',')})`) : 'n/a'
      const orphanFilter = touched.length ? psql(`DELETE FROM gw_route_filter WHERE route_id IN (${touched.join(',')})`) : 'n/a'
      // 注意：gw_route 是 @TableLogic 逻辑删除 → API DELETE 后行仍在（is_deleted=1），
      // 核账必须带 is_deleted=0 过滤
      const leftRoutes = psql(`SELECT count(*) FROM gw_route WHERE route_name IN ('${ROUTE_A}', '${ROUTE_B}') AND is_deleted = 0`)
      notes.push(`孤儿谓词行清除=${orphanPred}; 孤儿filter行清除=${orphanFilter}; 残留路由行=${leftRoutes}`)
      expect(leftRoutes, '清理后 A/B 路由行应清零').toBe('0')
    } catch (e) {
      notes.push(`清理异常（需人工核账）: ${String(e).slice(0, 300)}`)
    }
    writeEvidence('scg', '12-99-cleanup', diag, notes.join('\n'))
  })
})
