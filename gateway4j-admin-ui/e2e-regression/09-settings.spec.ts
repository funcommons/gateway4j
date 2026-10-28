import { test, expect, login, shot, writeEvidence, formField, apiCall } from './helpers'

/**
 * BL-09 系统设置
 * 覆盖：通用设置、安全设置、字典查询、主题 Tab。
 *
 * 已知缺陷：
 *   D4  后端无 /v1/config/** 端点 → GET/PUT /v1/config/system 均 404，
 *       通用设置与安全设置两个 Tab 完全不可用
 *   D5  canEdit('system') → 'system:edit' 后端没有 → 页面无「保存」按钮
 *   D1  顶栏未渲染 → 主题 Tab 指引的"顶栏切换按钮"不存在
 *   P2  后端原始错误文案（"请求资源不存在"）直接透出到界面
 */
test.describe('BL-09 系统设置', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/settings')
    await page.waitForTimeout(2000)
  })

  test('09-01 系统设置页加载：四个 Tab 均存在', async ({ page, shot, diag }) => {
    const tabs = page.locator('.fc-tab')
    const n = await tabs.count()
    await shot('settings', '09-01-settings-tabs')
    expect(n, '系统设置应提供 通用/安全/字典/主题 四个 Tab').toBeGreaterThanOrEqual(4)
    writeEvidence('settings', '09-01-settings-tabs', diag, `Tab 数: ${n}`)
  })

  test('09-02 通用设置：站点名称与语言字段渲染', async ({ page, shot, diag }) => {
    await expect(formField(page, '站点名称')).toBeVisible({ timeout: 15_000 })
    await expect(formField(page, '语言')).toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-02-general-form')
    writeEvidence('settings', '09-02-general-form', diag)
  })

  test('09-03 通用设置应提供「保存」按钮', async ({ page, shot, diag }) => {
    // D5: canEdit('system') → 'system:edit' 不存在 → 保存按钮不渲染
    const save = page.getByRole('button', { name: '保存', exact: true })
    await expect(save, '通用设置应提供「保存」按钮').toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-03-general-save-button')
    writeEvidence('settings', '09-03-general-save-button', diag)
  })

  test('09-04 配置接口 GET /v1/config/system 应可用', async ({ page, shot, diag }) => {
    // D4: 后端根本没有 /v1/config/** 端点
    const res = await apiCall(page, 'GET', '/v1/config/system')
    await shot('settings', '09-04-config-api-missing', true)
    writeEvidence('settings', '09-04-config-api-missing', diag,
      `GET /v1/config/system → status=${res.status}, body=${JSON.stringify(res.payload).slice(0, 300)}`)
    expect(res.ok, '配置读取接口应返回 2xx').toBe(true)
  })

  test('09-05 通用设置页不应向用户暴露后端原始错误文案', async ({ page, shot, diag }) => {
    // P2: 界面直接显示「请求资源不存在」
    const text = await page.locator('.app-page').innerText()
    await shot('settings', '09-05-raw-error-leak', true)
    writeEvidence('settings', '09-05-raw-error-leak', diag, `页面文本片段: ${text.replace(/\s+/g, ' ').slice(0, 220)}`)
    expect(text, '应展示用户友好的错误提示，而不是后端原始报文').not.toMatch(/请求资源不存在|系统繁忙|trace_id/)
  })

  test('09-06 安全设置：Token/Refresh 过期时间数字输入渲染', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '安全设置' }).first().click()
    await page.waitForTimeout(1500)
    await expect(formField(page, 'Token 过期时间(小时)')).toBeVisible({ timeout: 15_000 })
    await expect(formField(page, 'Refresh Token 过期时间(天)')).toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-06-security-form')
    writeEvidence('settings', '09-06-security-form', diag)
  })

  test('09-07 字典查询：已知 code 返回条目并渲染表格', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '字典查询' }).first().click()
    await page.waitForTimeout(1500)
    await page.locator('.app-page input').first().fill('ROUTE_TYPE')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('settings', '09-07-dict-query', true)
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    writeEvidence('settings', '09-07-dict-query', diag, `ROUTE_TYPE 返回行数=${rows}`)
    expect(rows, 'ROUTE_TYPE 字典应返回条目').toBeGreaterThan(0)
  })

  test('09-08 字典查询：不存在的 code 应给出友好提示且不崩溃', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '字典查询' }).first().click()
    await page.waitForTimeout(1500)
    await page.locator('.app-page input').first().fill('NOT_EXIST_DICT_CODE')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.waitForTimeout(2500)
    await shot('settings', '09-08-dict-not-exist', true)
    const errText = await page.locator('[data-testid="load-error"]').innerText().catch(() => '')
    writeEvidence('settings', '09-08-dict-not-exist', diag, `错误提示: "${errText.trim()}"`)
    expect(errText.trim().length, '未知字典 code 应给出错误提示').toBeGreaterThan(0)
    expect(errText, '错误提示应是用户友好文案而非后端原始报文').not.toMatch(/系统繁忙|trace_id/)
  })

  test('09-09 主题 Tab：指引的主题切换入口应可达', async ({ page, shot, diag }) => {
    // D1: 主题切换器在顶栏 actions 插槽里，而顶栏根本没渲染
    await page.locator('.fc-tab', { hasText: '主题' }).first().click()
    await page.waitForTimeout(1500)
    await shot('settings', '09-09-theme-tab', true)
    const body = await page.locator('.fc-tab-pane').first().innerText()
    const switcher = page.locator('.fc-theme-switcher, [class*="theme-switcher"]').first()
    const visible = await switcher.isVisible().catch(() => false)
    writeEvidence('settings', '09-09-theme-tab', diag,
      `主题页文案: "${body.trim()}"；主题切换器可见=${visible}`)
    expect(body, '主题页应有说明文案').toContain('主题')
    expect(visible, '主题切换器应可达（当前顶栏未渲染，切换器不存在）').toBe(true)
  })
})
