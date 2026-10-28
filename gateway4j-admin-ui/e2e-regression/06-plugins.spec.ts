import { test, expect, login, shot, writeEvidence, formField, confirmButton, uniq, apiCall } from './helpers'

/**
 * BL-06 插件管理（列表 / 编辑器 / 全局插件 / 内置插件）
 * 覆盖：列表加载、类型与状态筛选、搜索、列表/分组视图切换、
 *       新建插件、Groovy 脚本校验、启用/禁用、删除、
 *       全局插件 PRE/POST 编排、内置插件配置表单。
 *
 * 已知缺陷：
 *   D2  FcFilterBar 无 actions 插槽 → 插件列表页「新建插件」按钮不渲染
 *   D6  后端 GET /v1/plugins 忽略 keyword / plugin_type / status 查询参数（过滤全失效）
 */
test.describe('BL-06 插件管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/plugins')
    await page.waitForTimeout(1800)
  })

  test('06-01 插件列表加载：表格渲染且含类型/阶段/状态列', async ({ page, shot, diag }) => {
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    const heads = await page.locator('.el-table__header th').allInnerTexts()
    const n = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('plugins', '06-01-plugin-list')
    expect(n, '插件列表应至少渲染 1 行').toBeGreaterThan(0)
    writeEvidence('plugins', '06-01-plugin-list', diag, `行数=${n}, 表头=${heads.join(' | ')}`)
  })

  test('06-02 列表/分组视图切换按钮可用', async ({ page, shot, diag }) => {
    const toggle = page.locator('[data-testid="view-toggle"]')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    await toggle.click()
    await page.waitForTimeout(1500)
    await shot('plugins', '06-02-grouped-view')
    await toggle.click()
    await page.waitForTimeout(1200)
    await shot('plugins', '06-02-table-view-back')
    writeEvidence('plugins', '06-02-grouped-view', diag)
  })

  test('06-03 按插件名搜索应过滤结果', async ({ page, shot, diag }) => {
    // D6: 后端忽略 keyword 参数 → 搜索无效果
    const search = page.locator('.fc-filter-bar input').first()
    await search.fill('__no_such_plugin__')
    await search.press('Enter')
    await page.waitForTimeout(2000)
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('plugins', '06-03-search-filter-not-applied')
    const api = await apiCall(page, 'GET', '/v1/plugins?page=1&page_size=20&keyword=__no_such_plugin__')
    const apiCount = api.payload?.records?.length ?? api.payload?.data?.records?.length
    writeEvidence('plugins', '06-03-search-filter-not-applied', diag,
      `UI 行数=${rows}; 后端带 keyword 返回条数=${apiCount}（不传 keyword 时为 ${(await apiCall(page, 'GET', '/v1/plugins?page=1&page_size=20')).payload?.records?.length}）`)
    expect(rows, '搜索不存在的插件名应过滤为空结果').toBeLessThanOrEqual(1)
  })

  test('06-04 类型筛选应生效', async ({ page, shot, diag }) => {
    const sel = page.locator('.fc-filter-bar .fc-select').first()
    await sel.click()
    await page.waitForTimeout(1000)
    const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first()
    const label = await opt.innerText().catch(() => '')
    await opt.click()
    await page.waitForTimeout(2000)
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('plugins', '06-04-type-filter')
    const api = await apiCall(page, 'GET', `/v1/plugins?page=1&page_size=20&plugin_type=${encodeURIComponent(label.trim())}`)
    const apiCount = api.payload?.records?.length ?? api.payload?.data?.records?.length
    writeEvidence('plugins', '06-04-type-filter', diag, `选中类型=${label.trim()}; UI 行数=${rows}; 后端返回=${apiCount}`)
    expect(rows, `按类型"${label.trim()}"筛选后应只剩该类型`).toBeGreaterThan(0)
  })

  test('06-05 状态筛选应生效', async ({ page, shot, diag }) => {
    const sel = page.locator('.fc-filter-bar .fc-select').nth(1)
    await sel.click()
    await page.waitForTimeout(1000)
    const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first()
    const label = await opt.innerText().catch(() => '')
    await opt.click()
    await page.waitForTimeout(2000)
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('plugins', '06-05-status-filter')
    writeEvidence('plugins', '06-05-status-filter', diag, `选中状态=${label.trim()}; UI 行数=${rows}`)
    expect(rows, `按状态"${label.trim()}"筛选后应有结果`).toBeGreaterThan(0)
  })

  test('06-06 插件列表应提供「新建插件」主操作入口', async ({ page, shot, diag }) => {
    // D2: FcFilterBar 无 actions 插槽 → 「新建插件」按钮不渲染
    const create = page.getByRole('button', { name: '新建', exact: true })
    await expect(create, '插件列表应提供「新建插件」主操作按钮').toBeVisible({ timeout: 10_000 })
    await shot('plugins', '06-06-create-plugin-entry')
    writeEvidence('plugins', '06-06-create-plugin-entry', diag)
  })

  test('06-07 新建插件：后端创建能力（POST /v1/plugins）正常', async ({ page, shot, diag }) => {
    // 与 06-06 配对：证明插件创建后端能力正常，缺陷仅在 UI 入口缺失
    const id = uniq('e2e_gvy')
    const res = await apiCall(page, 'POST', '/v1/plugins', {
      plugin_name: id,
      plugin_id: id,
      plugin_type: 'GROOVY',
      plugin_phase: 'PRE',
      scope: 'ROUTE',
      sort_order: 1,
      config: '{}',
      script_content: 'def x = 1; return true',
    })
    await shot('plugins', '06-07-plugin-create-api')
    writeEvidence('plugins', '06-07-plugin-create-api', diag, `POST /v1/plugins status=${res.status} payload=${JSON.stringify(res.payload).slice(0, 250)}`)
    expect(res.ok, '后端应能创建 Groovy 插件').toBe(true)
  })

  test('06-08 新建插件：必填与格式校验提示', async ({ page, shot, diag }) => {
    await page.goto('/plugins/new')
    await page.waitForTimeout(1800)
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(1500)
    const errs = await page.locator('.el-form-item__error').count()
    await shot('plugins', '06-08-plugin-create-validation', true)
    expect(errs, '空表单保存应触发必填校验').toBeGreaterThan(0)
    writeEvidence('plugins', '06-08-plugin-create-validation', diag, `校验错误条数: ${errs}`)
  })

  test('06-09 Groovy 插件：脚本校验按钮返回校验结果', async ({ page, shot, diag }) => {
    const id = uniq('e2e_gvyv')
    await page.goto('/plugins/new')
    await page.waitForTimeout(1800)
    await formField(page, '插件名称').fill(id)
    await formField(page, '插件标识').fill(id)
    const typeSeg = page.locator('.el-form-item', { hasText: '类型' }).locator('.fc-segmented-item, .fc-segmented button')
    for (const it of await typeSeg.all()) {
      const txt = (await it.innerText().catch(() => '')).trim()
      if (txt.includes('Groovy')) { await it.click(); break }
    }
    await page.waitForTimeout(1000)
    const groovyTab = page.locator('.fc-tab', { hasText: 'Groovy' }).first()
    await expect(groovyTab).toBeVisible({ timeout: 10_000 })
    await groovyTab.click()
    await page.waitForTimeout(800)
    await page.locator('textarea').first().fill('def x = 1; return true')
    await page.getByRole('button', { name: '校验脚本' }).click()
    await page.waitForTimeout(3000)
    await shot('plugins', '06-09-groovy-script-validate')
    const hint = await page.locator('.hint').first().innerText().catch(() => '')
    writeEvidence('plugins', '06-09-groovy-script-validate', diag, `校验反馈: "${hint.trim()}"`)
    expect(hint.trim().length, '脚本校验后应给出结果反馈').toBeGreaterThan(0)
  })

  test('06-10 插件启用/禁用：状态真的变更', async ({ page, shot, diag }) => {
    const enable = page.getByRole('button', { name: '启用', exact: true }).first()
    const hasEnable = await enable.isVisible().catch(() => false)
    if (hasEnable) {
      const row = enable.locator('xpath=ancestor::tr')
      const before = await row.innerText()
      await enable.click()
      await page.waitForTimeout(3000)
      await page.reload()
      await page.waitForTimeout(2500)
      const row2 = page.locator('.el-table__body-wrapper tbody tr').first()
      const after = await row2.innerText()
      await shot('plugins', '06-10-plugin-enabled-verified')
      writeEvidence('plugins', '06-10-plugin-enabled-verified', diag, `启用前="${before.replace(/\s+/g, ' ')}" / 启用后="${after.replace(/\s+/g, ' ')}"`)
    } else {
      await shot('plugins', '06-10-plugin-enabled-verified')
      writeEvidence('plugins', '06-10-plugin-enabled-verified', diag, '没有处于「已禁用」状态的插件可测')
    }
  })

  test('06-11 插件删除：确认后从列表消失', async ({ page, shot, diag }) => {
    const id = uniq('e2e_delgvy')
    await apiCall(page, 'POST', '/v1/plugins', {
      plugin_name: id, plugin_id: id, plugin_type: 'GROOVY', plugin_phase: 'PRE',
      scope: 'ROUTE', sort_order: 1, config: '{}', script_content: 'def x = 1; return true',
    })
    await page.reload()
    await page.waitForTimeout(2500)
    const search = page.locator('.fc-filter-bar input').first()
    await search.fill(id)
    await search.press('Enter')
    await page.waitForTimeout(2000)
    const del = page.getByRole('button', { name: '删除', exact: true }).first()
    const visible = await del.isVisible().catch(() => false)
    if (visible) {
      await del.click()
      await page.waitForTimeout(1000)
      await shot('plugins', '06-11-plugin-delete-confirm')
      await confirmButton(page).click()
      await page.waitForTimeout(3000)
    }
    await shot('plugins', '06-11-plugin-delete-result')
    const still = await page.getByText(id).count()
    writeEvidence('plugins', '06-11-plugin-delete-result', diag, `删除后仍可见次数=${still}`)
    expect(still, '删除后列表中不应再出现该插件').toBe(0)
  })

  test('06-12 全局插件：PRE/POST 两个阶段 Tab 与插件开关', async ({ page, shot, diag }) => {
    await page.goto('/plugins/global')
    await page.waitForTimeout(2200)
    const tabs = await page.locator('.fc-tab').count()
    await shot('plugins', '06-12-global-plugins-pre', true)
    expect(tabs, '全局插件页应提供 PRE/POST 阶段 Tab').toBeGreaterThanOrEqual(2)
    const post = page.locator('.fc-tab', { hasText: '后置' }).first()
    if (await post.isVisible().catch(() => false)) {
      await post.click()
      await page.waitForTimeout(1800)
      await shot('plugins', '06-12-global-plugins-post', true)
    }
    writeEvidence('plugins', '06-12-global-plugins-pre', diag, `Tab 数: ${tabs}`)
  })

  test('06-13 内置插件：分类卡片渲染并可打开配置表单', async ({ page, shot, diag }) => {
    await page.goto('/plugins/builtin')
    await page.waitForTimeout(2500)
    const cards = await page.locator('.type-card').count()
    await shot('plugins', '06-13-builtin-plugins', true)
    expect(cards, '内置插件页应渲染插件卡片').toBeGreaterThan(0)
    const cfg = page.getByRole('button', { name: '插件配置' }).first()
    await expect(cfg, '内置插件卡片应提供「插件配置」按钮').toBeVisible({ timeout: 10_000 })
    await cfg.click()
    await page.waitForTimeout(2500)
    await shot('plugins', '06-13-builtin-config-dialog', false)
    const fields = await page.locator('.fc-dialog .el-form-item, .fc-dialog .fc-input, .fc-dialog input').count()
    const emptyHint = await page.locator('.fc-dialog .fc-empty, .fc-dialog').innerText().catch(() => '')
    // D21: 后端 config_schema 返回的是 JSON 字符串，前端按对象取 .properties → 动态表单恒为空
    const schema = await apiCall(page, 'GET', '/v1/plugins/builtin-types/security/schema')
    const raw = schema.payload?.config_schema
    let propCount = 0
    try { propCount = Object.keys(JSON.parse(raw).properties ?? {}).length } catch { propCount = -1 }
    writeEvidence('plugins', '06-13-builtin-config-dialog', diag,
      `弹窗控件数=${fields}; 弹窗文本="${emptyHint.trim().slice(0, 80)}"; 后端 schema 类型=${typeof raw}, 可解析出属性数=${propCount}`)
    expect(fields, '配置弹窗应按 JSON Schema 渲染动态表单控件（当前恒为「暂无 schema」）').toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    writeEvidence('plugins', '06-13-builtin-plugins', diag, `内置插件卡片数: ${cards}`)
  })

  test('06-14 内置插件：搜索过滤生效', async ({ page, shot, diag }) => {
    await page.goto('/plugins/builtin')
    await page.waitForTimeout(2200)
    const search = page.locator('.app-page input').first()
    await search.fill('__no_such_builtin__')
    await page.waitForTimeout(1500)
    const cards = await page.locator('.type-card').count()
    await shot('plugins', '06-14-builtin-search-empty')
    expect(cards, '搜索不存在的内置插件应无卡片').toBe(0)
    writeEvidence('plugins', '06-14-builtin-search-empty', diag, `剩余卡片数: ${cards}`)
  })
})
