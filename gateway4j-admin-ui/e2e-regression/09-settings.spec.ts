import { test, expect, loginV2, shot, writeEvidence, apiCall } from './helpers'

/**
 * BL-09 系统设置（v2 迁移版，P4e 步 1）
 * v2 页面：/v2/settings，FcTabsPanel 四分区（set-section-nav）：站点配置 / 字典查询 /
 * 变更记录 / 审计日志。旧版「通用设置 + 安全设置」两 Tab 在 v2 合并为站点配置一张
 * 四字段表单（site_name / language / token_expiry_hours / refresh_expiry_days），
 * 且旧版 D4/D5 缺陷已修：后端 /v1/config/{type} 端点已存在，gw_permission 已含
 * system:edit → set-submit 可见。
 *
 * c 类用例注释保留（1 条）：
 *   09-09 主题 Tab —— v2 砍除主题分区；主题切换入口已由 P4e-0 落到 v2 顶栏
 *   （testid v2-theme-switch），其行为验证随步 4（01-auth / 10-theme 壳迁移）覆盖。
 */
test.describe('BL-09 系统设置', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/settings')
    await page.waitForTimeout(1500)
  })

  test('09-01 系统设置页加载：四个分区均存在', async ({ page, shot, diag }) => {
    const tabs = page.getByTestId('set-section-nav').locator('.fc-tab')
    const n = await tabs.count()
    const texts = await tabs.allInnerTexts()
    await shot('settings', '09-01-settings-tabs')
    expect(n, '系统设置应提供 站点配置/字典查询/变更记录/审计日志 四个分区').toBe(4)
    writeEvidence('settings', '09-01-settings-tabs', diag, `分区数: ${n} (${texts.join(' | ')})`)
  })

  test('09-02 站点配置：站点名称与语言字段渲染', async ({ page, shot, diag }) => {
    // 默认落在 general 分区；FcInput 的 testid 落在原生 input（单份），
    // 而 FcSelect（language）的 testid 会落在 fc-select 根 + 内层 el-select 两层 → 需 .first()
    await expect(page.getByTestId('set-input-site_name')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('set-input-language').first()).toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-02-general-form')
    writeEvidence('settings', '09-02-general-form', diag)
  })

  test('09-03 站点配置应提供「保存」按钮', async ({ page, shot, diag }) => {
    // v2 已修复旧 D5：system:edit 权限码存在 → set-submit 渲染
    const save = page.getByTestId('set-submit')
    await expect(save, '站点配置应提供「保存」按钮').toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-03-general-save-button')
    writeEvidence('settings', '09-03-general-save-button', diag)
  })

  test('09-04 配置接口 GET /v1/config/system 应可用', async ({ page, shot, diag }) => {
    // v2 已修复旧 D4：后端 ConfigController GET /v1/config/{configType} 已存在
    const res = await apiCall(page, 'GET', '/v1/config/system')
    await shot('settings', '09-04-config-api', true)
    writeEvidence('settings', '09-04-config-api', diag,
      `GET /v1/config/system → status=${res.status}, body=${JSON.stringify(res.payload).slice(0, 300)}`)
    expect(res.ok, '配置读取接口应返回 2xx').toBe(true)
  })

  test('09-05 站点配置页不应向用户暴露后端原始错误文案', async ({ page, shot, diag }) => {
    const text = await page.locator('.set-page').innerText()
    await shot('settings', '09-05-raw-error-leak', true)
    writeEvidence('settings', '09-05-raw-error-leak', diag, `页面文本片段: ${text.replace(/\s+/g, ' ').slice(0, 220)}`)
    expect(text, '应展示用户友好的错误提示，而不是后端原始报文').not.toMatch(/请求资源不存在|系统繁忙|trace_id/)
  })

  test('09-06 安全过期字段：Token/Refresh 过期时间数字输入渲染', async ({ page, shot, diag }) => {
    // v2 结构差异：旧「安全设置」Tab 并入站点配置同一张表单，无需切 Tab
    await expect(page.getByTestId('set-input-token_expiry_hours')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('set-input-refresh_expiry_days')).toBeVisible({ timeout: 10_000 })
    await shot('settings', '09-06-security-form')
    writeEvidence('settings', '09-06-security-form', diag)
  })

  test('09-07 字典查询：已知 code 返回条目并渲染表格', async ({ page, shot, diag }) => {
    await page.getByTestId('set-section-nav').locator('.fc-tab', { hasText: '字典查询' }).click()
    await page.waitForTimeout(800)
    await page.getByTestId('set-dict-input').fill('ROUTE_TYPE')
    await page.getByTestId('set-dict-submit').click()
    await page.waitForTimeout(2000)
    await shot('settings', '09-07-dict-query', true)
    const rows = await page.locator('[data-testid^="set-dict-row-"]').count()
    writeEvidence('settings', '09-07-dict-query', diag, `ROUTE_TYPE 返回行数=${rows}`)
    expect(rows, 'ROUTE_TYPE 字典应返回条目').toBeGreaterThan(0)
  })

  test('09-08 字典查询：不存在的 code 应给出友好提示且不崩溃', async ({ page, shot, diag }) => {
    await page.getByTestId('set-section-nav').locator('.fc-tab', { hasText: '字典查询' }).click()
    await page.waitForTimeout(800)
    await page.getByTestId('set-dict-input').fill('NOT_EXIST_DICT_CODE')
    await page.getByTestId('set-dict-submit').click()
    await page.waitForTimeout(2000)
    await shot('settings', '09-08-dict-not-exist', true)
    const err = page.getByTestId('set-dict-error')
    const errText = await err.innerText().catch(() => '')
    writeEvidence('settings', '09-08-dict-not-exist', diag, `错误提示: "${errText.trim()}"`)
    expect(err, '未知字典 code 应给出错误提示').toBeVisible()
    expect(errText, '错误提示应是用户友好文案而非后端原始报文').not.toMatch(/系统繁忙|trace_id/)
  })

  // ── c 类注释保留（v2 砍除主题分区；主题切换入口 = P4e-0 顶栏 v2-theme-switch，随步 4 壳迁移验证）──
  // test('09-09 主题 Tab：指引的主题切换入口应可达', async ({ page, shot, diag }) => {
  //   await page.locator('.fc-tab', { hasText: '主题' }).first().click()
  //   ...
  // })
})
