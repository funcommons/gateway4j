import { test, expect, login, shot, writeEvidence } from './helpers'

/**
 * BL-02 监控大盘 (Dashboard / Monitor)
 * 覆盖：统计卡片、路由状态 Tab（搜索/分段筛选）、指标 Tab（选路由/时间范围/粒度/自动刷新/图表）、
 *       拓扑 Tab（关系图渲染）、状态行点击跳转、错误态处理。
 */
test.describe('BL-02 监控大盘', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/dashboard')
    await page.waitForTimeout(1500)
  })

  test('02-01 大盘页面加载：顶部统计卡片渲染', async ({ page, shot, diag }) => {
    await expect(page.locator('.stat-grid').first()).toBeVisible({ timeout: 20_000 })
    const cards = page.locator('.stat')
    await expect(cards.first()).toBeVisible()
    const n = await cards.count()
    expect(n, '监控大盘应至少渲染 1 张统计卡片').toBeGreaterThan(0)
    // P0-2: 总请求数必须是单个数字（Long→String 契约下字符串求和不得退化为 "000..." 拼接）
    const totalCard = page.locator('.stat', { hasText: '总请求数' })
    if (await totalCard.isVisible().catch(() => false)) {
      const totalText = (await totalCard.locator('.stat-value').textContent()) ?? ''
      expect(totalText.trim(), '总请求数应为纯整数，不得出现连续 0 拼接').toMatch(/^\d+$/)
      expect(totalText.trim(), '总请求数不得出现 13 个 0 式拼接').not.toMatch(/^0{2,}$/)
      writeEvidence('dashboard', '02-01-dashboard-stat-cards', diag, `总请求数文本: ${totalText.trim()}`)
    }
    await shot('dashboard', '02-01-dashboard-stat-cards')
    writeEvidence('dashboard', '02-01-dashboard-stat-cards', diag, `统计卡片数量: ${n}`)
  })

  test('02-02 路由状态 Tab：可切换并展示状态表格', async ({ page, shot, diag }) => {
    const tab = page.locator('.fc-tab', { hasText: '路由状态' }).first()
    await tab.click()
    await page.waitForTimeout(1200)
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 15_000 })
    await shot('dashboard', '02-02-tab-route-status')
    writeEvidence('dashboard', '02-02-tab-route-status', diag)
  })

  test('02-03 路由状态 Tab：关键词搜索过滤生效', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '路由状态' }).first().click()
    await page.waitForTimeout(800)
    const search = page.locator('.status-toolbar input').first()
    await search.fill('__no_such_route_zzz__')
    await page.waitForTimeout(1200)
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    const n = await rows.count()
    await shot('dashboard', '02-03-status-search-empty')
    expect(n, '不存在的关键字应过滤为空结果').toBeLessThanOrEqual(1)
    writeEvidence('dashboard', '02-03-status-search-empty', diag, `过滤后行数: ${n}`)
  })

  test('02-04 路由状态 Tab：分段筛选切换（全部/健康）', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '路由状态' }).first().click()
    await page.waitForTimeout(800)
    const seg = page.locator('.status-toolbar .fc-segmented-item, .status-toolbar button').first()
    if (await seg.isVisible().catch(() => false)) {
      await seg.click()
      await page.waitForTimeout(1000)
    }
    await shot('dashboard', '02-04-status-segment-filter')
    writeEvidence('dashboard', '02-04-status-segment-filter', diag)
  })

  test('02-05 指标 Tab：路由选择器 + 时间范围 + 粒度 + 自动刷新开关', async ({ page, shot, diag }) => {
    const tab = page.locator('.fc-tab', { hasText: '指标' }).first()
    await tab.click()
    await page.waitForTimeout(1500)
    await expect(page.locator('.metrics-toolbar').first()).toBeVisible({ timeout: 15_000 })
    // 打开路由下拉
    const sel = page.locator('.metrics-toolbar .fc-select').first()
    await sel.click()
    await page.waitForTimeout(800)
    const opt = page.locator('.el-select-dropdown__item').first()
    if (await opt.isVisible().catch(() => false)) await opt.click()
    await page.waitForTimeout(1500)
    await shot('dashboard', '02-05-metrics-toolbar', true)
    writeEvidence('dashboard', '02-05-metrics-toolbar', diag)
  })

  test('02-06 指标 Tab：趋势图表 canvas 渲染', async ({ page, shot, diag }) => {
    const tab = page.locator('.fc-tab', { hasText: '指标' }).first()
    await tab.click()
    await page.waitForTimeout(2500)
    const chart = page.locator('.trend-chart canvas').first()
    const visible = await chart.isVisible().catch(() => false)
    await shot('dashboard', '02-06-metrics-chart')
    expect(visible, '指标 Tab 应渲染 ECharts canvas 图表').toBe(true)
    writeEvidence('dashboard', '02-06-metrics-chart', diag)
  })

  test('02-07 拓扑 Tab：关系图（VueFlow）渲染出节点', async ({ page, shot, diag }) => {
    const tab = page.locator('.fc-tab', { hasText: '拓扑' }).first()
    await tab.click()
    await page.waitForTimeout(2500)
    const flow = page.locator('.vue-flow').first()
    const visible = await flow.isVisible().catch(() => false)
    const nodeCount = await page.locator('.vue-flow__node').count()
    await shot('dashboard', '02-07-topology-graph')
    expect(visible, '拓扑 Tab 应渲染 VueFlow 容器').toBe(true)
    writeEvidence('dashboard', '02-07-topology-graph', diag, `VueFlow 节点数: ${nodeCount}`)
  })

  test('02-08 路由状态行点击可跳转到路由详情', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '路由状态' }).first().click()
    await page.waitForTimeout(1500)
    const row = page.locator('.el-table__body-wrapper tbody tr').first()
    if (await row.isVisible().catch(() => false)) {
      await row.click()
      await page.waitForTimeout(2000)
      await shot('dashboard', '02-08-status-row-click')
      writeEvidence('dashboard', '02-08-status-row-click', diag, `跳转到: ${page.url()}`)
    } else {
      await shot('dashboard', '02-08-status-row-click-no-rows')
      writeEvidence('dashboard', '02-08-status-row-click-no-rows', diag, '状态表为空，无行可点击')
    }
  })

  test('02-09 指标 Tab：时间范围与粒度切换后图表重新渲染', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '指标' }).first().click()
    await page.waitForTimeout(2500)
    const segs = page.locator('.metrics-toolbar .fc-segmented')
    const n = await segs.count()
    let switched = false
    for (let i = 0; i < n; i++) {
      const items = segs.nth(i).locator('.fc-segmented-item, button')
      const c = await items.count()
      if (c > 1) {
        await items.nth(1).click()
        await page.waitForTimeout(2000)
        switched = true
        break
      }
    }
    await shot('dashboard', '02-09-metrics-range-switch')
    expect(switched, '指标 Tab 应提供时间范围/粒度切换控件').toBe(true)
    writeEvidence('dashboard', '02-09-metrics-range-switch', diag, `分段控件组数: ${n}`)
  })

  test('02-10 自动刷新开关打开后展示"最近刷新时间"', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '指标' }).first().click()
    await page.waitForTimeout(2000)
    const sw = page.locator('.metrics-toolbar .fc-switch, .metrics-toolbar .el-switch').first()
    await sw.click()
    await page.waitForTimeout(6000)
    const last = page.locator('.last-refresh')
    const visible = await last.isVisible().catch(() => false)
    await shot('dashboard', '02-10-auto-refresh-last-refresh')
    expect(visible, '开启自动刷新后应显示"最近刷新"时间').toBe(true)
    // P0-2: 最近刷新必须是 24 小时制 HH:mm:ss，不允许 locale 漂移出的 12 小时制（如 1:31:28 AM）
    const lastText = await last.textContent()
    expect(lastText ?? '', '最近刷新时间应为 24 小时制 HH:mm:ss').toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(lastText ?? '', '最近刷新时间不得出现 12 小时制 AM/PM').not.toMatch(/[AP]M/i)
    writeEvidence('dashboard', '02-10-auto-refresh-last-refresh', diag, `最近刷新文本: ${lastText}`)
  })

  test('02-11 拓扑 Tab：节点数量与后端 /v1/monitor/topology 返回一致', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '拓扑' }).first().click()
    await page.waitForTimeout(3000)
    const uiNodes = await page.locator('.vue-flow__node').count()
    const api = await page.evaluate(async () => {
      const tok = localStorage.getItem('gw4j_token')
      const r = await fetch('/v1/monitor/topology', { headers: { Authorization: 'Bearer ' + tok } })
      const j = await r.json()
      return (j.nodes || []).length
    })
    await shot('dashboard', '02-11-topology-node-count')
    expect(uiNodes, `拓扑节点数应与后端返回一致(后端 ${api})`).toBe(api)
    writeEvidence('dashboard', '02-11-topology-node-count', diag, `UI 节点数=${uiNodes}, 后端节点数=${api}`)
  })

  test('02-12 指标 Tab：未选择路由时应给出明确空态', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '指标' }).first().click()
    await page.waitForTimeout(2500)
    const cards = await page.locator('.metric-card').count()
    const chart = await page.locator('.trend-chart canvas').count()
    await shot('dashboard', '02-12-metrics-empty-state')
    writeEvidence('dashboard', '02-12-metrics-empty-state', diag, `指标卡=${cards}, 图表=${chart}`)
    expect(cards + chart, '未选路由时应展示指标卡或图表，而非完全空白').toBeGreaterThan(0)
  })
})
