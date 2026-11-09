import { test, expect, loginV2, writeEvidence } from './helpers'

/**
 * BL-02 监控大盘（v2 重定位迁移，P4e 步 5 收官）
 *
 * v2 把旧 /dashboard 拆成三个面（旧四 Tab 形态不再存在）：
 *   /v2/monitor           —— 网关级大盘：KPI 五卡 mon-kpi-*、实时流条 mon-stream-badge、
 *                            上游健康单卡 mon-upstream-card、慢路由 Top5 mon-slow-card、
 *                            状态码 donut mon-donut、网关时序 mon-chart-qps/latency + mon-range-seg
 *   /v2/overview          —— 拓扑（手绘 SVG topo-node-*，非 VueFlow）+ 待办/事件/上游卡
 *   /v2/routes/:id/detail —— 单路由四联图 dtl-chart-{qps,latency,error,status}（替代旧按路由指标 Tab）
 *
 * 逐条重定位映射（裁决口径：网关级→monitor 对应点；按路由/拓扑→overview 或 detail；无对应→c 类裁掉）：
 *   02-01 统计卡片渲染     → monitor KPI 五卡（P0-2 数字护栏随迁至 mon-kpi-hits，formatHits 口径）
 *   02-02 路由状态表格     → monitor 上游健康卡 mon-upstream-card（v2 运行态健康唯一落点）
 *   02-03 状态表关键词搜索 → c 类：v2 无路由状态表，搜索无落点（路由检索归 /v2/routes，03 已覆盖）
 *   02-04 状态表分段筛选   → c 类：v2 无 全部/健康 分段（健康聚合在上游卡 mon-up-bad，无筛选交互）
 *   02-05 指标工具栏       → monitor 时序工具条 mon-range-seg + mon-autorefresh-switch + mon-last-refresh
 *                             （路由选择器/粒度分段 c 类缺口：网关级无按路由下拉，粒度随时间档映射不外露）
 *   02-06 趋势图渲染       → monitor mon-chart-qps 手绘 SVG polyline（v2 弃 ECharts canvas）
 *   02-07 拓扑渲染         → overview topo-canvas + topo-node-*（SVG 关系图）
 *   02-08 状态行点击跳详情 → c 类：monitor/overview 均无行点击跳转入口（源码无 @click 处理器），
 *                             进详情入口归路由列表 act-detail（03 已覆盖），缺口不造数
 *   02-09 范围切换重渲染   → monitor mon-range-seg 切档 → time_range=7d 重拉落 API 证据
 *   02-10 自动刷新+最近刷新 → monitor mon-autorefresh-switch + mon-last-refresh（24 小时制 P0 护栏随迁）
 *   02-11 拓扑节点数对账   → overview topo-node 数 = /v1/monitor/topology nodes + 2（固定 client/gateway 合成节点）
 *   02-12 未选路由空态     → detail dtl-charts 四联图 4 图卡恒渲染（有图或显式空态，绝不空白）
 *
 * 覆盖缺口（v2 产品裁减留痕，契约 §4.5）：旧「路由状态 Tab」的路由级运行状态表
 * （关键词搜索 / 全部-健康分段 / 行点击跳详情）在 v2 无对应面，c 类 3 条不迁移。
 */
test.describe('BL-02 监控大盘', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/monitor')
  })

  test('02-01 大盘页面加载：KPI 五卡渲染（P0-2 数字护栏）', async ({ page, shot, diag }) => {
    // 五张聚合卡：命中/QPS/P95/错误率/连接数（trafficFailed 时值退 '—'，卡壳仍渲染）
    const tids = ['mon-kpi-hits', 'mon-kpi-qps', 'mon-kpi-p95', 'mon-kpi-error', 'mon-kpi-connections']
    for (const tid of tids) {
      await expect(page.getByTestId(tid), `KPI 卡 ${tid} 应渲染`).toBeVisible({ timeout: 20_000 })
    }
    // P0-2: 命中总量必须是正常数字格式（Long→String 契约下字符串求和不得退化为 "000..." 拼接）；
    // v2 formatHits 口径：纯整数或 k/M/B 缩写（如 12k / 1.2M / 3.4B），流量失败退 '—'
    const hitsText = ((await page.getByTestId('mon-kpi-hits').locator('.kpi-v').textContent()) ?? '').trim()
    expect(hitsText, '命中总量应为数字/kMB 缩写或 —，不得出现连续 0 拼接').toMatch(/^(\d+(\.\d+)?[kMB]?|—)$/)
    expect(hitsText, '命中总量不得出现 13 个 0 式拼接').not.toMatch(/^0{2,}/)
    writeEvidence('dashboard', '02-01-monitor-kpi-cards', diag, `mon-kpi-hits 文本: ${hitsText}`)
    await shot('dashboard', '02-01-monitor-kpi-cards')
  })

  test('02-02 上游健康卡渲染（原路由状态表重定位）', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('mon-upstream-card')).toBeVisible({ timeout: 20_000 })
    // v2 运行态健康唯一落点：上游健康行（mon-up-row-{id}）或显式空态（mon-upstream-empty）；
    // 可达性异常时另有聚合条 mon-up-bad。旧路由状态表（名称/状态/上游/请求数/错误率五列）已砍除。
    const rows = page.locator('[data-testid^="mon-up-row-"]')
    const n = await rows.count()
    const emptyVisible = await page.getByTestId('mon-upstream-empty').isVisible().catch(() => false)
    expect(n > 0 || emptyVisible, '上游健康卡应渲染健康行或显式空态').toBe(true)
    let extra = `上游健康行数: ${n}`
    if (n > 0) {
      const badVisible = await page.getByTestId('mon-up-bad').isVisible().catch(() => false)
      extra += `, 异常聚合条: ${badVisible}`
    }
    await shot('dashboard', '02-02-monitor-upstream-card')
    writeEvidence('dashboard', '02-02-monitor-upstream-card', diag, extra)
  })

  test('02-05 时序工具条：时间范围分段 + 自动刷新开关 + 最近刷新（原指标工具栏重定位）', async ({ page, shot, diag }) => {
    const seg = page.getByTestId('mon-range-seg')
    await expect(seg).toBeVisible({ timeout: 20_000 })
    // 时间范围三档：近 1 小时 / 近 24 小时 / 近 7 天（默认 24h）
    await expect(seg.getByRole('radio')).toHaveCount(3)
    await expect(page.getByTestId('mon-autorefresh-switch')).toBeVisible()
    await expect(page.getByTestId('mon-last-refresh')).toBeVisible()
    // c 类缺口：旧指标工具栏的「路由选择器 + 粒度分段」在 v2 网关级大盘无对应
    //（按路由时序落 /v2/routes/:id/detail dtl-chart-*；粒度由时间档显式映射不外露）
    await shot('dashboard', '02-05-monitor-ts-toolbar')
    writeEvidence('dashboard', '02-05-monitor-ts-toolbar', diag)
  })

  test('02-06 时序图渲染：QPS SVG polyline（原 ECharts canvas 重定位）', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('mon-chart-qps')).toBeVisible({ timeout: 20_000 })
    // v2 弃 ECharts canvas 改手绘 SVG：data_points 非空即渲染 polyline（本环境恒回 snapshot 数据点）
    const svg = page.getByTestId('mon-chart-qps').locator('svg.ts-chart')
    await expect(svg, 'QPS 图应渲染 SVG 折线序列').toBeVisible({ timeout: 15_000 })
    const latencySvg = page.getByTestId('mon-chart-latency').locator('svg.ts-chart')
    await expect(latencySvg, '延迟分位图应渲染 SVG 折线').toBeVisible({ timeout: 15_000 })
    await shot('dashboard', '02-06-monitor-qps-chart')
    writeEvidence('dashboard', '02-06-monitor-qps-chart', diag)
  })

  test('02-09 时间范围切换后网关时序重拉重渲染', async ({ page, shot, diag }) => {
    const seg = page.getByTestId('mon-range-seg')
    await expect(seg).toBeVisible({ timeout: 20_000 })
    // 默认 24h → 切第三档「近 7 天」（FcSegmented radio 按 nth 序号点击，可访问名会拼组名不稳）
    const items = seg.getByRole('radio')
    await items.nth(2).click()
    await expect(items.nth(2)).toHaveAttribute('aria-checked', 'true')
    // 重渲染证据：切档触发 /v1/monitor/gateway/timeseries?time_range=7d 重拉
    await expect
      .poll(() => diag.apiCalls.some((c) => c.includes('time_range=7d')), { timeout: 15_000 })
      .toBe(true)
    // 切档后图表仍渲染（loadEpoch 竞态守卫下不闪空）
    await expect(page.getByTestId('mon-chart-qps').locator('svg.ts-chart')).toBeVisible({ timeout: 15_000 })
    await shot('dashboard', '02-09-monitor-range-switch')
    writeEvidence('dashboard', '02-09-monitor-range-switch', diag)
  })

  test('02-10 自动刷新开关 + 最近刷新时间（24 小时制 P0 护栏）', async ({ page, shot, diag }) => {
    const sw = page.getByTestId('mon-autorefresh-switch').getByRole('switch')
    await expect(sw).toBeVisible({ timeout: 20_000 })
    const last = page.getByTestId('mon-last-refresh')
    const before = ((await last.textContent()) ?? '').trim()
    // v2 默认 autoRefresh=true（5s interval）：关→开一个来回，等一个刷新节拍后时间戳必须前进
    expect(await sw.getAttribute('aria-checked')).toBe('true')
    await sw.click()
    expect(await sw.getAttribute('aria-checked')).toBe('false')
    await sw.click()
    expect(await sw.getAttribute('aria-checked')).toBe('true')
    await page.waitForTimeout(6_000)
    const after = ((await last.textContent()) ?? '').trim()
    await shot('dashboard', '02-10-monitor-autorefresh')
    expect(after, '开启自动刷新后应显示「最近刷新」时间').toMatch(/最近刷新/)
    // P0-2: 最近刷新必须是 24 小时制 HH:mm:ss，不允许 locale 漂移出的 12 小时制（如 1:31:28 AM）
    expect(after, '最近刷新时间应为 24 小时制 HH:mm:ss').toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(after, '最近刷新时间不得出现 12 小时制 AM/PM').not.toMatch(/[AP]M/i)
    expect(after, '自动刷新节拍后时间戳应前进').not.toBe(before)
    writeEvidence('dashboard', '02-10-monitor-autorefresh', diag, `before=${before} / after=${after}`)
  })

  test('02-07 拓扑渲染（overview SVG 关系图，原 VueFlow 拓扑 Tab 重定位）', async ({ page, shot, diag }) => {
    await page.goto('/v2/overview')
    await expect(page.getByTestId('topo-canvas')).toBeVisible({ timeout: 20_000 })
    // v2 拓扑为手绘 SVG（非 VueFlow）：client/gateway 固定节点 + 后端动态节点（可达 15s，重页防超时）
    const nodes = page.locator('[data-testid^="topo-node-"]')
    await expect(nodes.first()).toBeVisible({ timeout: 15_000 })
    const n = await nodes.count()
    await shot('dashboard', '02-07-overview-topology')
    writeEvidence('dashboard', '02-07-overview-topology', diag, `拓扑节点数: ${n}`)
  })

  test('02-11 拓扑节点数与后端 /v1/monitor/topology 一致（含固定 client/gateway 合成节点）', async ({ page, shot, diag }) => {
    await page.goto('/v2/overview')
    const nodes = page.locator('[data-testid^="topo-node-"]')
    await expect(nodes.first()).toBeVisible({ timeout: 20_000 })
    // 拓扑接口返回裸 {nodes, edges}（无信封包裹）；兼容信封形态取 nodes 数
    const api = await page.evaluate(async () => {
      const tok = localStorage.getItem('gw4j_token')
      const r = await fetch('/v1/monitor/topology', { headers: { Authorization: 'Bearer ' + tok } })
      const j = await r.json()
      return (j.nodes ?? (j.data ?? {}).nodes ?? []).length
    })
    // 动态节点随拓扑接口异步挂载（client/gateway 合成节点先行渲染，立即计数必竞态）
    // —— 轮询 UI 计数至与 后端+2 对平（后端 0 节点时 2===0+2 即刻对平，不误伤空库）
    await expect
      .poll(() => nodes.count(), { timeout: 20_000 })
      .toBe(api + 2)
    const uiNodes = await nodes.count()
    await shot('dashboard', '02-11-overview-topology-count')
    // v2 在后端 nodes 之上恒补 client/gateway 两个合成节点（Overview.vue 布局层固定注入）
    expect(uiNodes, `拓扑节点数应=后端 ${api} + 2 合成节点(client/gateway)`).toBe(api + 2)
    writeEvidence('dashboard', '02-11-overview-topology-count', diag, `UI 节点数=${uiNodes}, 后端节点数=${api}`)
  })

  test('02-12 单路由指标四联图恒渲染（原未选路由空态重定位）', async ({ page, shot, diag }) => {
    // 旧语义「未选路由时指标区不空白」在 v2 转译：网关级大盘无路由选择态，按路由指标
    // 唯一落点=detail 四联图 —— 必须渲染 4 张图卡（数据缺失显式 dtl-chart-empty 占位/错误条）
    await page.goto('/v2/routes/-100/detail')
    await expect(page.getByTestId('dtl-charts')).toBeVisible({ timeout: 20_000 })
    const chartCards = await page.locator('[data-testid^="dtl-chart-"]').count()
    expect(chartCards, '四联图应渲染 4 张图卡（qps/latency/error/status）').toBe(4)
    const errBanner = await page.getByTestId('dtl-charts-error').isVisible().catch(() => false)
    await shot('dashboard', '02-12-detail-charts')
    writeEvidence('dashboard', '02-12-detail-charts', diag, `图卡数=${chartCards}, 时序错误条=${errBanner}`)
  })

  // ── c 类注释保留（v2 无对应面，缺口不造数，契约 §4.5）─────────────────
  // test('02-03 路由状态 Tab：关键词搜索过滤生效', async ({ page }) => {
  //   // 旧页 .status-toolbar input 过滤 el-table 行；v2 监控面无路由状态表 → 搜索无落点
  //   //（路由检索能力归 /v2/routes 列表搜索，03-routes 已覆盖），缺口留痕不迁移
  // })
  //
  // test('02-04 路由状态 Tab：分段筛选切换（全部/健康）', async ({ page }) => {
  //   // 旧页 .status-toolbar FcSegmented 全部/健康筛选；v2 健康聚合在上游卡 mon-up-bad
  //   // 一条聚合条，无筛选交互控件 → 缺口留痕不迁移
  // })
  //
  // test('02-08 路由状态行点击可跳转到路由详情', async ({ page }) => {
  //   // 旧页 el-table 行点击跳 /routes/:id；v2 monitor/overview 源码均无行点击处理器
  //   //（mon-up-row / mon-slow-row / topo-node 无 @click 导航），进详情入口归路由列表
  //   // act-detail（03-routes 已覆盖）→ 缺口留痕不迁移
  // })
})
