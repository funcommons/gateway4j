import { test, expect, loginV2, shot, writeEvidence, uniq } from './helpers'

/**
 * BL-05 导入导出（v2 迁移版，P4e 步 2）
 * v2 页面：/v2/import-export（imp-* testid），FcTabsPanel 三 Tab（导出/导入/环境对比）。
 * 页面默认落在「导入」Tab（tab ref 初始 'import'），导出类用例先点「导出」Tab。
 *
 * 旧→v2 形态差异（2026-11-09 逐条核源码+实播更正）：
 *   - 冲突策略：新旧均为 FcSegmented，v2 文案改「跳过同名/覆盖同名/遇同名报错」（imp-strategy radio）
 *   - 空选导出：v2 裁决 6 —— 空选=导出全部路由，成功 toast 即反馈，不再报错（旧 05-04 语义改写）
 *   - 预检：本地 JSON 解析 + 后端 validateImport，失败原因逐字进 imp-report-reason
 * 旧缺陷在 v2 的去向：
 *   P2 预检失败无原因说明 —— v2 已修复（imp-report-reason 给出「JSON 解析失败：…」/「路由包结构无效：缺少 routes 数组」）
 *   D2 路由列表无「导入」入口按钮 —— v2 形态：侧栏导航直达本页（05-10 改打侧栏入口语义）
 */
test.describe('BL-05 导入导出', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/import-export')
    await page.waitForTimeout(1000)
  })

  test('05-01 导入导出页加载：导出/导入/环境对比三个 Tab 均存在', async ({ page, shot, diag }) => {
    const tabs = page.locator('.fc-tab')
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 })
    const n = await tabs.count()
    const labels = await tabs.allInnerTexts()
    await shot('importExport', '05-01-import-export-page')
    expect(n, '应提供导出/导入/环境对比三个 Tab').toBeGreaterThanOrEqual(3)
    writeEvidence('importExport', '05-01-import-export-page', diag, `Tab 数: ${n}, 文案: ${labels.join(' | ')}`)
  })

  test('05-02 导出 Tab：路由表格加载并支持多选', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('imp-export-table')).toBeVisible({ timeout: 15_000 })
    const cbs = page.locator('[data-testid^="imp-row-check-"]')
    const rows = await cbs.count()
    const cb = cbs.first()
    await cb.check()
    await page.waitForTimeout(400)
    const checked = await cb.isChecked()
    await shot('importExport', '05-02-export-route-selection')
    writeEvidence('importExport', '05-02-export-route-selection', diag, `可选行数=${rows}, 勾选生效=${checked}`)
    expect(rows, '导出 Tab 应提供路由多选框').toBeGreaterThan(0)
    expect(checked, '勾选路由复选框应生效').toBe(true)
  })

  test('05-03 导出：下载路由包触发浏览器下载', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1200)
    await expect(page.getByTestId('imp-export-table')).toBeVisible({ timeout: 15_000 })
    const dl = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null)
    await page.getByTestId('imp-export-btn').click()
    const download = await dl
    await page.waitForTimeout(1200)
    await shot('importExport', '05-03-export-download')
    writeEvidence('importExport', '05-03-export-download', diag,
      `下载文件名: ${download ? download.suggestedFilename() : '(未触发)'}`)
    expect(download, '点击「下载路由包」应触发浏览器下载（routes-<ts>.json Blob）').not.toBeNull()
  })

  test('05-04 导出：不勾选任何路由时导出全部并给出成功反馈（v2 裁决 6）', async ({ page, shot, diag }) => {
    // 旧页空选报错；v2 改为空选=导出全部路由，成功 toast（导出成功）即反馈
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1200)
    const dl = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null)
    await page.getByTestId('imp-export-btn').click()
    const download = await dl
    await page.waitForTimeout(800)
    const toast = await page.locator('.el-message').count()
    await shot('importExport', '05-04-export-without-selection')
    writeEvidence('importExport', '05-04-export-without-selection', diag,
      `空选导出下载=${download ? download.suggestedFilename() : '(未触发)'}, toast=${toast}`)
    expect(download, '空选应导出全部路由并触发下载').not.toBeNull()
    expect(toast, '空选导出应有成功 toast 反馈').toBeGreaterThan(0)
  })

  test('05-05 导入 Tab：非法 JSON 预检应给出可定位的错误原因', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.getByTestId('imp-json-textarea').fill('{ this is not valid json ')
    await page.getByTestId('imp-precheck-btn').click()
    await page.waitForTimeout(1500)
    await shot('importExport', '05-05-import-invalid-json-precheck', true)
    const reason = (await page.getByTestId('imp-report-reason').innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-05-import-invalid-json-precheck', diag, `预检原因: "${reason}"`)
    expect(reason, '非法 JSON 时预检应说明失败原因（「JSON 解析失败：…」）').toMatch(/解析|格式|无效|invalid|parse|error/i)
  })

  test('05-06 导入 Tab：合法路由包预检通过并展示报告', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    const payload = JSON.stringify({
      version: '1.0',
      routes: [
        {
          route_name: uniq('e2e_imported'),
          route_type: 'BACKEND',
          path: '/e2e/imported/**',
          upstream_url: 'http://127.0.0.1:19001',
          sort_order: 900,
          remark: '回归测试导入包',
        },
      ],
    })
    await page.getByTestId('imp-json-textarea').fill(payload)
    await page.getByTestId('imp-precheck-btn').click()
    await page.waitForTimeout(2500)
    await shot('importExport', '05-06-import-valid-precheck', true)
    const report = (await page.getByTestId('imp-report').innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-06-import-valid-precheck', diag, `预检报告文本: "${report.slice(0, 120)}"`)
    expect(report, '预检通过应展示报告（「预检通过，可以导入」）').toContain('可以导入')
  })

  test('05-07 导入 Tab：冲突策略（跳过/覆盖/报错）可切换', async ({ page, shot, diag }) => {
    // 侦察更正（2026-11-09 实播）：v2 策略控件仍为 FcSegmented（radio，aria-checked 标选中），
    // 选项文案为「跳过同名/覆盖同名/遇同名报错」（v2.importExport.skip/overwrite/error）。
    // 选中态项的可访问名会被 a11y 树拼上组标签（「导入策略 覆盖同名 …」），按 name 定位不稳 → 按序号点击
    const radios = page.getByTestId('imp-strategy').getByRole('radio')
    const labels = (await radios.allInnerTexts()).map(s => s.trim())
    await shot('importExport', '05-07-import-strategy-open')
    expect(labels, '策略分段应提供三种冲突策略')
      .toEqual(expect.arrayContaining(['跳过同名', '覆盖同名', '遇同名报错']))
    expect(await radios.count(), '策略分段应恰有三项').toBe(3)
    for (const i of [1, 2, 0]) {
      await radios.nth(i).click()
      await expect(radios.nth(i), `第 ${i + 1} 项（${labels[i]}）点击后应选中`)
        .toHaveAttribute('aria-checked', 'true', { timeout: 5_000 })
    }
    await shot('importExport', '05-07-import-strategy-switch')
    writeEvidence('importExport', '05-07-import-strategy-switch', diag, `选项=${labels.join('/')}, 三策略逐项切换 aria-checked 均生效`)
  })

  test('05-08 导入：正式导入后新路由出现在路由列表', async ({ page, shot, diag }) => {
    const name = uniq('e2e_imp')
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    const payload = JSON.stringify({
      version: '1.0',
      routes: [
        { route_name: name, route_type: 'BACKEND', path: `/e2e/${name}/**`, upstream_url: 'http://127.0.0.1:19001', sort_order: 901 },
      ],
    })
    await page.getByTestId('imp-json-textarea').fill(payload)
    await page.getByTestId('imp-precheck-btn').click()
    await page.waitForTimeout(1500)
    await page.getByTestId('imp-import-btn').click()
    await page.waitForTimeout(3000)
    await shot('importExport', '05-08-import-done')
    // v2 路由列表：/v2/routes，客户端过滤搜索框（aria-label「搜路径 / 名称…」）
    await page.goto('/v2/routes')
    await page.waitForTimeout(1800)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(1200)
    const found = await page.locator('[data-testid^="route-row-"]').filter({ hasText: name }).count()
    await shot('importExport', '05-08-imported-route-in-list')
    writeEvidence('importExport', '05-08-imported-route-in-list', diag, `导入后列表命中行数: ${found}; 路由名: ${name}`)
    expect(found, '导入的路由应出现在路由列表').toBeGreaterThan(0)
  })

  test('05-09 导入：JSON 结构非法（缺 routes 数组）应给出原因', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.getByTestId('imp-json-textarea').fill(JSON.stringify({ version: '1.0' }))
    await page.getByTestId('imp-precheck-btn').click()
    await page.waitForTimeout(1500)
    await shot('importExport', '05-09-import-bad-structure', true)
    const reason = (await page.getByTestId('imp-report-reason').innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-09-import-bad-structure', diag, `预检原因: "${reason}"`)
    expect(reason, '结构非法时应说明缺少 routes 数组等原因').toMatch(/routes|缺失|结构|字段/i)
  })

  test('05-10 v2 侧栏提供「导入导出」入口并可直达本页', async ({ page, shot, diag }) => {
    // 旧 D2：路由列表无「导入」跳转按钮；v2 形态裁决 —— 侧栏导航直达（路由组第三叶子）
    await page.goto('/v2/overview')
    await page.waitForTimeout(1200)
    const nav = page.locator('.v2-nav-item', { hasText: '导入导出' })
    await expect(nav, 'v2 侧栏应提供「导入导出」导航入口').toBeVisible({ timeout: 15_000 })
    await nav.click()
    await page.waitForURL(/\/v2\/import-export$/, { timeout: 15_000 })
    await expect(page.getByTestId('imp-page')).toBeVisible({ timeout: 15_000 })
    await shot('importExport', '05-10-import-entry-from-sidebar')
    writeEvidence('importExport', '05-10-import-entry-from-sidebar', diag)
  })
})
