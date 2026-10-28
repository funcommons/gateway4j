import { test, expect, login, shot, writeEvidence, apiCall, uniq } from './helpers'

/**
 * BL-05 导入导出
 * 覆盖：导出 Tab（路由多选、状态筛选、下载路由包）、
 *       导入 Tab（JSON 编辑、策略切换、预检、正式导入、错误提示）。
 *
 * 已知缺陷：
 *   P2  预检失败只给"可导入：否"，没有任何原因说明（非法 JSON / 结构不对都无提示）。
 */
test.describe('BL-05 导入导出', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/import-export')
    await page.waitForTimeout(2000)
  })

  test('05-01 导入导出页加载：导出/导入两个 Tab 均存在', async ({ page, shot, diag }) => {
    const tabs = page.locator('.fc-tab')
    const n = await tabs.count()
    await shot('importExport', '05-01-import-export-page')
    expect(n, '应至少有导出/导入两个 Tab').toBeGreaterThanOrEqual(2)
    writeEvidence('importExport', '05-01-import-export-page', diag, `Tab 数: ${n}`)
  })

  test('05-02 导出 Tab：路由表格加载并支持多选', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1800)
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 15_000 })
    const cb = page.locator('.el-table__body-wrapper .el-checkbox').first()
    const visible = await cb.isVisible().catch(() => false)
    if (visible) await cb.click()
    await page.waitForTimeout(600)
    await shot('importExport', '05-02-export-route-selection')
    expect(visible, '导出 Tab 应提供路由多选框').toBe(true)
    writeEvidence('importExport', '05-02-export-route-selection', diag)
  })

  test('05-03 导出：下载路由包触发浏览器下载', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1800)
    const cb = page.locator('.el-table__body-wrapper .el-checkbox').first()
    if (await cb.isVisible().catch(() => false)) await cb.click()
    await page.waitForTimeout(600)
    const dl = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null)
    await page.getByRole('button', { name: '下载路由包', exact: true }).click()
    const download = await dl
    await page.waitForTimeout(1200)
    await shot('importExport', '05-03-export-download')
    expect(download, '点击"下载路由包"应触发浏览器下载').not.toBeNull()
    if (download) writeEvidence('importExport', '05-03-export-download', diag, `下载文件名: ${download.suggestedFilename()}`)
  })

  test('05-04 导出：不勾选任何路由时应给出提示而非静默失败', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导出' }).click()
    await page.waitForTimeout(1800)
    await page.getByRole('button', { name: '下载路由包', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('importExport', '05-04-export-without-selection')
    const err = await page.locator('[data-testid="action-error"]').count()
    const toast = await page.locator('.el-message').count()
    writeEvidence('importExport', '05-04-export-without-selection', diag, `错误区=${err}, toast=${toast}`)
    expect(err + toast, '未选择路由时应有明确提示').toBeGreaterThan(0)
  })

  test('05-05 导入 Tab：非法 JSON 预检应给出可定位的错误原因', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.waitForTimeout(1500)
    await page.locator('textarea').first().fill('{ this is not valid json ')
    await page.getByRole('button', { name: '预检', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('importExport', '05-05-import-invalid-json-precheck', true)
    const report = (await page.locator('.report').first().innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-05-import-invalid-json-precheck', diag, `预检报告文本: "${report}"`)
    expect(report, '非法 JSON 时预检应说明失败原因（如"JSON 解析失败"）').toMatch(/解析|格式|无效|invalid|parse|error/i)
  })

  test('05-06 导入 Tab：合法路由包预检通过并展示报告', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.waitForTimeout(1500)
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
    await page.locator('textarea').first().fill(payload)
    await page.getByRole('button', { name: '预检', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('importExport', '05-06-import-valid-precheck', true)
    const report = (await page.locator('.report').first().innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-06-import-valid-precheck', diag, `预检报告文本: "${report}"`)
    expect(report, '预检通过应展示报告').toContain('可导入')
  })

  test('05-07 导入 Tab：冲突策略（跳过/覆盖/报错）可切换', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.waitForTimeout(1500)
    const labels = ['跳过', '覆盖', '报错']
    const seen: string[] = []
    for (const l of labels) {
      const item = page.locator('.fc-segmented-item, .fc-segmented button', { hasText: l }).first()
      const visible = await item.isVisible().catch(() => false)
      if (visible) {
        await item.click()
        await page.waitForTimeout(600)
        seen.push(l)
      }
    }
    await shot('importExport', '05-07-import-strategy-switch')
    expect(seen.length, '导入页应提供三种冲突策略').toBe(3)
    writeEvidence('importExport', '05-07-import-strategy-switch', diag, `可切换策略: ${seen.join('/')}`)
  })

  test('05-08 导入：正式导入后新路由出现在路由列表', async ({ page, shot, diag }) => {
    const name = uniq('e2e_imp')
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.waitForTimeout(1500)
    const payload = JSON.stringify({
      version: '1.0',
      routes: [
        { route_name: name, route_type: 'BACKEND', path: `/e2e/${name}/**`, upstream_url: 'http://127.0.0.1:19001', sort_order: 901 },
      ],
    })
    await page.locator('textarea').first().fill(payload)
    await page.getByRole('button', { name: '预检', exact: true }).click()
    await page.waitForTimeout(2000)
    await page.locator('form').getByRole('button', { name: '导入', exact: true }).click()
    await page.waitForTimeout(3000)
    await shot('importExport', '05-08-import-done')
    await page.goto('/routes')
    await page.waitForTimeout(1500)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await shot('importExport', '05-08-imported-route-in-list')
    const found = await page.getByText(name).count()
    writeEvidence('importExport', '05-08-imported-route-in-list', diag, `导入后列表命中行数: ${found}; 路由名: ${name}`)
    expect(found, '导入的路由应出现在路由列表').toBeGreaterThan(0)
  })

  test('05-09 导入：JSON 结构非法（缺 routes 数组）应给出原因', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '导入' }).click()
    await page.waitForTimeout(1500)
    await page.locator('textarea').first().fill(JSON.stringify({ version: '1.0' }))
    await page.getByRole('button', { name: '预检', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('importExport', '05-09-import-bad-structure', true)
    const report = (await page.locator('.report').first().innerText().catch(() => '')).trim()
    writeEvidence('importExport', '05-09-import-bad-structure', diag, `预检报告文本: "${report}"`)
    expect(report, '结构非法时应说明缺少 routes 等原因').toMatch(/routes|缺失|结构|字段/i)
  })

  test('05-10 导入导出页应提供可达的"导入"主操作入口', async ({ page, shot, diag }) => {
    // D2: FcFilterBar 无 actions 插槽 → 路由列表页的「导入」跳转按钮不渲染，
    //     本页虽然可用，但用户无法从路由列表进入本页
    await page.goto('/routes')
    await page.waitForTimeout(1500)
    const jump = page.getByRole('button', { name: '导入', exact: true })
    await expect(jump, '路由列表应提供「导入」入口按钮以跳转到导入导出页').toBeVisible({ timeout: 10_000 })
    await shot('importExport', '05-10-import-entry-from-list')
    writeEvidence('importExport', '05-10-import-entry-from-list', diag)
  })
})
