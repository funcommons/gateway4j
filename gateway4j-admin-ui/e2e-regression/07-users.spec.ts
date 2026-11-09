import { test, expect, loginV2, v2Row, v2RowAction, v2Toast, v2Confirm, shot, writeEvidence, uniq, apiCall } from './helpers'

/**
 * BL-07 用户管理（v2 迁移版，P4e 步 1）
 * v2 页面：/v2/users，语义表格 usr-table，行 testid usr-row-{id}，
 * 行内动作直排 FcButton（usr-action-edit/toggle/reset-pw/delete-{id}，不再是旧版「更多」下拉）。
 * 旧版 D2/D5 缺陷（新建入口不渲染、行操作被权限码拖藏）在 v2 已修复：
 * 后端 gw_permission 已含 user:edit → admin 可见 usr-action-create 与全部行内动作。
 */
test.describe('BL-07 用户管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/users')
    await page.waitForTimeout(1200)
  })

  test('07-01 用户列表加载：表格 + 分页 + 关键列渲染', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('usr-table')).toBeVisible({ timeout: 20_000 })
    const rows = await page.locator('[data-testid^="usr-row-"]').count()
    const pager = await page.locator('.fc-pagination').count()
    const heads = await page.locator('.usr-table thead th').allInnerTexts()
    await shot('users', '07-01-user-list')
    expect(rows, '用户列表应至少渲染 1 行').toBeGreaterThan(0)
    expect(pager, '用户列表应提供分页组件').toBeGreaterThan(0)
    writeEvidence('users', '07-01-user-list', diag, `用户行数=${rows}, 分页组件=${pager}, 表头=${heads.join(' | ')}`)
  })

  test('07-02 用户搜索过滤生效', async ({ page, shot, diag }) => {
    // v2 搜索为 300ms 防抖自动触发（无需回车）；FcInput 的 data-testid 直接落在原生 input 上
    await page.getByTestId('usr-search').fill('admin')
    await page.waitForTimeout(2000)
    const rows = await v2Row(page, 'usr', 'admin').count()
    await shot('users', '07-02-user-search')
    const api = await apiCall(page, 'GET', '/v1/users?page=1&page_size=20&keyword=admin')
    const apiRows = api.payload?.records?.length ?? api.payload?.data?.records?.length
    writeEvidence('users', '07-02-user-search', diag, `UI 命中行数=${rows}; 后端带 keyword 返回=${apiRows}`)
    expect(rows, '搜索 admin 应至少命中 1 行').toBeGreaterThan(0)
  })

  test('07-03 用户列表应提供「新建用户」主操作入口', async ({ page, shot, diag }) => {
    const create = page.getByTestId('usr-action-create')
    await expect(create, '用户列表应提供「新建用户」主操作按钮').toBeVisible({ timeout: 10_000 })
    await shot('users', '07-03-create-user-entry')
    writeEvidence('users', '07-03-create-user-entry', diag)
  })

  test('07-04 用户行应提供 编辑/启用禁用/重置密码/删除 操作', async ({ page, shot, diag }) => {
    // v2：行级动作改为行内按钮直排（usr-action-<动作名>-<id>），不再是「更多」下拉；
    // 断言从「菜单项文案」改为「行内四类动作 testid 齐备」
    const row = page.locator('[data-testid^="usr-row-"]').first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    const btns = await row.locator('button').count()
    const edit = await v2RowAction(page, 'usr', 'edit').count()
    const toggle = await v2RowAction(page, 'usr', 'toggle').count()
    const resetPw = await v2RowAction(page, 'usr', 'reset-pw').count()
    const del = await v2RowAction(page, 'usr', 'delete').count()
    await shot('users', '07-04-row-actions', true)
    writeEvidence('users', '07-04-row-actions', diag,
      `首行按钮数=${btns}; 全表 edit=${edit} toggle=${toggle} reset-pw=${resetPw} delete=${del}`)
    expect(btns, '用户行应提供行内操作按钮').toBeGreaterThan(0)
    expect([edit, toggle, resetPw, del].every(n => n > 0),
      '用户行应提供 编辑/启用禁用/重置密码/删除 四类操作').toBe(true)
  })

  test('07-05 权限状态对用户不静默（有操作按钮 或 明确只读提示）', async ({ page, shot, diag }) => {
    // v2 等价物：admin 有 user:edit → usr-action-create 可见；
    // 无写权限账号则显示 usr-readonly-hint。二者必居其一，不允许静默。
    const btns = await page.locator('.usr-page button').count()
    const hasHint = await page.getByTestId('usr-readonly-hint').isVisible().catch(() => false)
    await shot('users', '07-05-not-silent')
    writeEvidence('users', '07-05-not-silent', diag, `按钮数=${btns}, 只读提示=${hasHint}`)
    expect(btns > 0 || hasHint, '页面要么提供操作按钮、要么给出只读说明，不得静默').toBe(true)
  })

  test('07-06 后端用户 CRUD 能力正常（API 层）', async ({ page, shot, diag }) => {
    const uname = uniq('e2e_apiuser')
    const created = await apiCall(page, 'POST', '/v1/users', {
      username: uname, password: 'E2ePass!123', real_name: 'API用户', phone: '13800138001', role_codes: ['ROLE_GUEST'],
    })
    const id = created.payload?.id ?? created.payload?.data?.id
    const updated = await apiCall(page, 'PATCH', `/v1/users/${id}`, { real_name: 'API用户-已改' })
    const list = await apiCall(page, 'GET', `/v1/users?page=1&page_size=50&keyword=${uname}`)
    const listRows = list.payload?.records?.length ?? list.payload?.data?.records?.length
    const deleted = await apiCall(page, 'DELETE', `/v1/users/${id}`)
    await shot('users', '07-06-user-crud-api')
    writeEvidence('users', '07-06-user-crud-api', diag,
      `创建=${created.status}, 更新=${updated.status}, 搜索命中=${listRows}, 删除=${deleted.status}`)
    expect(created.ok, '后端应能创建用户').toBe(true)
    expect(updated.ok, '后端应能更新用户').toBe(true)
    expect(listRows, '后端应能按关键字搜到用户').toBeGreaterThan(0)
    expect(deleted.ok, '后端应能删除用户').toBe(true)
  })

  test('07-07 用户列表分页可翻页', async ({ page, shot, diag }) => {
    const pager = page.locator('.fc-pagination')
    if (await pager.isVisible().catch(() => false)) {
      const next = pager.locator('.btn-next')
      if (await next.isVisible().catch(() => false) && !(await next.isDisabled())) {
        await next.click()
        await page.waitForTimeout(1500)
      }
    }
    await shot('users', '07-07-user-pagination')
    const rows = await page.locator('[data-testid^="usr-row-"]').count()
    writeEvidence('users', '07-07-user-pagination', diag, `翻页后行数=${rows}`)
  })

  test('07-08 用户管理页应有可写操作的可达入口（新建/编辑）', async ({ page, shot, diag }) => {
    const count = await page.locator('.usr-page button').count()
    await shot('users', '07-08-no-writable-action', true)
    writeEvidence('users', '07-08-no-writable-action', diag, `页面按钮总数=${count}`)
    expect(count, '用户管理页应至少存在一个可写操作按钮（新建/编辑等）').toBeGreaterThan(0)
  })

  test('07-09 用户 UI 闭环：新建（usr-submit）→ 行内删除（v2Confirm + v2Toast）', async ({ page, shot, diag }) => {
    // v2 新增覆盖：旧版因 D2/D5 整模块只读，UI 闭环从未可测；v2 权限码修复后可走通
    const uname = uniq('e2e_uiuser')
    await page.getByTestId('usr-action-create').click()
    const dialog = page.getByTestId('usr-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // role_codes 默认 ['ROLE_OPS']，无需触碰 FcSelect；FcInput 的 testid 直接落在原生 input
    await page.getByTestId('usr-input-username').fill(uname)
    await page.getByTestId('usr-input-password').fill('E2ePass!123')
    await page.getByTestId('usr-input-realname').fill('UI闭环用户')
    await shot('users', '07-09-create-dialog')
    await page.getByTestId('usr-submit').click()
    await expect(v2Toast(page, 'success', 'usr-'), '新建成功应有 success toast').toBeVisible({ timeout: 15_000 })

    const row = v2Row(page, 'usr', uname)
    await expect(row, '新建用户应出现在列表中').toBeVisible({ timeout: 15_000 })
    await row.locator('[data-testid^="usr-action-delete-"]').click()
    await expect(v2Confirm(page), '删除应有 danger 确认弹窗').toBeVisible({ timeout: 10_000 })
    await shot('users', '07-09-delete-confirm')
    await v2Confirm(page).click()
    await expect(v2Toast(page, 'success', 'usr-'), '删除成功应有 success toast').toBeVisible({ timeout: 15_000 })
    await expect(row, '删除后行应消失').toBeHidden({ timeout: 15_000 })
    writeEvidence('users', '07-09-ui-crud-loop', diag, `UI 闭环用户=${uname}`)
  })
})
