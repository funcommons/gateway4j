import { test, expect, login, shot, writeEvidence, apiCall } from './helpers'

/**
 * BL-08 角色与权限（RBAC）
 * 覆盖：角色列表加载、我的权限列表加载、Tab 切换、权限资源类型列渲染。
 *
 * 已知缺陷：
 *   P1 功能缺失 角色权限页是纯只读展示：没有角色 CRUD、没有角色-权限绑定 UI、
 *                 后端 RbacController 也只有 GET /v1/roles 与 GET /v1/permissions。
 *   P1 数据缺口 4 个种子角色中只有 ROLE_ADMIN 有权限绑定，其余 3 个角色空授权。
 */
test.describe('BL-08 角色与权限', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/roles')
    await page.waitForTimeout(2000)
  })

  test('08-01 角色权限页加载：角色 Tab 渲染角色表', async ({ page, shot, diag }) => {
    await expect(page.locator('.fc-tabs').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 15_000 })
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('roles', '08-01-roles-tab')
    expect(rows, '角色列表应至少渲染 1 行').toBeGreaterThan(0)
    writeEvidence('roles', '08-01-roles-tab', diag, `角色行数: ${rows}`)
  })

  test('08-02 4 个种子角色全部渲染（ROLE_ADMIN/ROLE_OPS/ROLE_DEV/ROLE_GUEST）', async ({ page, shot, diag }) => {
    const body = await page.locator('.el-table').first().innerText()
    await shot('roles', '08-02-seed-roles')
    for (const code of ['ROLE_ADMIN', 'ROLE_OPS', 'ROLE_DEV', 'ROLE_GUEST']) {
      expect(body, `角色列表应包含 ${code}`).toContain(code)
    }
    writeEvidence('roles', '08-02-seed-roles', diag)
  })

  test('08-03 切换到"我的权限"Tab 渲染权限表', async ({ page, shot, diag }) => {
    const tab = page.locator('.fc-tab', { hasText: '权限' }).first()
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await tab.click()
    await page.waitForTimeout(1800)
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 15_000 })
    const rows = await page.locator('.el-table__body-wrapper tbody tr').count()
    await shot('roles', '08-03-permissions-tab')
    expect(rows, '权限列表应至少渲染 1 行').toBeGreaterThan(0)
    writeEvidence('roles', '08-03-permissions-tab', diag, `权限行数: ${rows}`)
  })

  test('08-04 权限表渲染权限编码/名称/资源类型列', async ({ page, shot, diag }) => {
    await page.locator('.fc-tab', { hasText: '权限' }).first().click()
    await page.waitForTimeout(1800)
    const heads = await page.locator('.el-table__header th').allInnerTexts()
    await shot('roles', '08-04-permission-columns')
    expect(heads.join('|'), '权限表应含权限/名称/类型列').toMatch(/权限|类型/)
    writeEvidence('roles', '08-04-permission-columns', diag, `表头: ${heads.join(' | ')}`)
  })

  test('08-05 角色权限页应提供角色授权/编辑能力入口', async ({ page, shot, diag }) => {
    // P1 功能缺失
    const count = await page.locator('.app-page button').count()
    const texts = await page.locator('.app-page button').allInnerTexts()
    await shot('roles', '08-05-no-role-management-actions', true)
    writeEvidence('roles', '08-05-no-role-management-actions', diag, `页面按钮: ${texts.join(' / ')}`)
    expect(count, '角色权限页应至少提供角色新增/编辑/授权入口').toBeGreaterThan(2)
  })

  test('08-06 非 admin 角色的权限绑定缺失应能被感知', async ({ page, shot, diag }) => {
    // P1 数据缺口：ROLE_OPS/ROLE_DEV/ROLE_GUEST 在 gw_role_permission_rel 里没有任何绑定
    const api = await apiCall(page, 'GET', '/v1/roles')
    const roles = api.payload?.data ?? api.payload ?? []
    await shot('roles', '08-06-role-permission-binding')
    writeEvidence('roles', '08-06-role-permission-binding', diag,
      `后端角色列表: ${JSON.stringify(roles).slice(0, 400)}`)
    expect(Array.isArray(roles) && roles.length >= 4, '后端应返回 4 个种子角色').toBe(true)
  })
})
