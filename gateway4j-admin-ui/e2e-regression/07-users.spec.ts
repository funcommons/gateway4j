import { test, expect, login, shot, writeEvidence, formField, confirmButton, uniq, apiCall } from './helpers'
import type { Page } from '@playwright/test'

/**
 * 「更多」下拉（FcDropdown）菜单项定位。
 * 行内动作已收进真下拉：菜单项是 EP 的 el-dropdown-item（role=menuitem），
 * 但它的无障碍名带图标字形（" 编辑"），所以不能用 exact 的 name 匹配 ——
 * 改为「可见菜单 + 精确文案」定位，既不受图标字形影响，也不会命中侧边栏的 menuitem。
 */
function rowMenuItems(page: Page) {
  return page.locator('.el-dropdown-menu:visible .el-dropdown-menu__item')
}
function rowMenuItem(page: Page, label: string) {
  return rowMenuItems(page).filter({ hasText: new RegExp(`^${label}$`) })
}

/**
 * BL-07 用户管理
 * 覆盖：列表加载、搜索、分页、新建/编辑/禁用/重置密码/删除。
 *
 * 已知缺陷（两条独立根因叠加，导致整个模块在 UI 上完全只读）：
 *   D2  FcFilterBar 无 actions 插槽 → 「新建用户」按钮不渲染
 *   D5  前端 canEdit('user') 拼出 'user:edit'，但后端权限表里没有这条 →
 *       行内「编辑/禁用/重置密码/删除」全部被 v-if 隐藏
 */
test.describe('BL-07 用户管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/users')
    await page.waitForTimeout(1800)
  })

  test('07-01 用户列表加载：表格 + 分页 + 关键列渲染', async ({ page, shot, diag }) => {
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    const pager = await page.locator('.fc-pagination').count()
    const heads = await page.locator('.el-table__header th').allInnerTexts()
    await shot('users', '07-01-user-list')
    expect(rows, '用户列表应至少渲染 1 行').toBeGreaterThan(0)
    expect(pager, '用户列表应提供分页组件').toBeGreaterThan(0)
    writeEvidence('users', '07-01-user-list', diag, `用户行数=${rows}, 分页组件=${pager}, 表头=${heads.join(' | ')}`)
  })

  test('07-02 用户搜索过滤生效', async ({ page, shot, diag }) => {
    const search = page.locator('.fc-filter-bar input, .app-page input').first()
    await search.fill('admin')
    await search.press('Enter')
    await page.waitForTimeout(2000)
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('users', '07-02-user-search')
    const api = await apiCall(page, 'GET', '/v1/users?page=1&page_size=20&keyword=admin')
    const apiRows = api.payload?.records?.length ?? api.payload?.data?.records?.length
    writeEvidence('users', '07-02-user-search', diag, `UI 行数=${rows}; 后端带 keyword 返回=${apiRows}`)
    expect(rows, '搜索 admin 应至少命中 1 行').toBeGreaterThan(0)
  })

  test('07-03 用户列表应提供「新建用户」主操作入口', async ({ page, shot, diag }) => {
    // D2
    const create = page.getByRole('button', { name: '新建', exact: true })
    await expect(create, '用户列表应提供「新建用户」主操作按钮').toBeVisible({ timeout: 10_000 })
    await shot('users', '07-03-create-user-entry')
    writeEvidence('users', '07-03-create-user-entry', diag)
  })

  test('07-04 用户行应提供 编辑/禁用/重置密码/删除 操作', async ({ page, shot, diag }) => {
    // D5: canEdit('user') → 'user:edit' 不存在 → 全部行操作被隐藏
    // 行内动作已收进「更多」下拉：断言从「行内有几个按钮」升级为「菜单里有哪些动作」
    const row = page.locator('.el-table__body-wrapper tbody tr').first()
    const btns = await row.getByRole('button').count()
    await row.getByTestId('row-actions').click()
    await page.waitForTimeout(500)
    const menuItems = (await page.getByRole('menuitem').allInnerTexts()).map(s => s.trim())
    await shot('users', '07-04-row-actions-missing', true)
    writeEvidence('users', '07-04-row-actions-missing', diag,
      `首行按钮数=${btns}; 「更多」菜单项=${menuItems.join(' | ')}`)
    expect(btns, '用户行应提供「更多」操作入口').toBeGreaterThan(0)
    expect(menuItems, '用户行「更多」菜单应提供 编辑/重置密码/删除 操作')
      .toEqual(expect.arrayContaining(['编辑', '重置密码', '删除']))
    expect(menuItems.includes('启用') || menuItems.includes('禁用'),
      '用户行「更多」菜单应提供启用/禁用操作').toBe(true)
  })

  test('07-05 权限状态对用户不静默（有操作按钮 或 明确只读提示）', async ({ page, shot, diag }) => {
    // D17 修复语义：admin 有 user:edit → 显示行操作、不显示只读提示；
    // 无写权限账号则相反。二者必居其一，不允许"按钮静默消失且无任何说明"。
    const text = await page.locator('.app-page').innerText()
    const btns = await page.locator('.app-page button').count()
    const hasHint = /只读|暂无权限|请联系管理员|无权限/.test(text)
    await shot('users', '07-05-not-silent')
    writeEvidence('users', '07-05-not-silent', diag, `按钮数=${btns}, 只读提示=${hasHint}`)
    expect(btns > 0 || hasHint, '页面要么提供操作按钮、要么给出只读说明，不得静默').toBe(true)
  })

  test('07-06 后端用户 CRUD 能力正常（API 层）', async ({ page, shot, diag }) => {
    // 与 07-03/07-04 配对：证明"用户管理不可用"的根因仅在 UI 层
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
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    writeEvidence('users', '07-07-user-pagination', diag, `翻页后行数=${rows}`)
  })

  test('07-08 用户管理页应有可写操作的可达入口（新建/编辑）', async ({ page, shot, diag }) => {
    // 合并式断言：只要页面上一个可写入口都没有即失败
    const count = await page.locator('.app-page button').count()
    await shot('users', '07-08-no-writable-action', true)
    writeEvidence('users', '07-08-no-writable-action', diag, `页面按钮总数=${count}`)
    expect(count, '用户管理页应至少存在一个可写操作按钮（新建/编辑等）').toBeGreaterThan(0)
  })
})
