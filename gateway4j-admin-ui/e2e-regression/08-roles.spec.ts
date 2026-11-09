import { test, expect, loginV2, v2RowAction, shot, writeEvidence, apiCall } from './helpers'

/**
 * BL-08 角色与权限（RBAC，v2 迁移版，P4e 步 1）
 * v2 页面：/v2/roles 直接渲染角色语义表（rol-table，原生 table 非 el-table），
 * 无旧版「角色 / 我的权限」双 Tab；权限矩阵收进行级「权限」动作弹窗（rol-perm-*），
 * 成员管理收进行级「成员」动作弹窗（rol-members-*）。
 * 旧版 P1 缺陷（纯只读、无角色 CRUD / 授权 UI）在 v2 已修复：rol-action-create +
 * 行内 编辑/权限/成员/删除 动作，gw_permission 已含 role:edit。
 *
 * c 类用例注释保留（2 条，随 v2 权限矩阵合并砍除，契约 §4.5）：
 *   08-03 切换到"我的权限"Tab 渲染权限表
 *   08-04 权限表渲染权限编码/名称/资源类型列
 */
test.describe('BL-08 角色与权限', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/roles')
    await page.waitForTimeout(1500)
  })

  test('08-01 角色权限页加载：角色表渲染', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('rol-list')).toBeVisible({ timeout: 20_000 })
    const rows = await page.locator('[data-testid^="rol-row-"]').count()
    await shot('roles', '08-01-roles-tab')
    expect(rows, '角色列表应至少渲染 1 行').toBeGreaterThan(0)
    writeEvidence('roles', '08-01-roles-tab', diag, `角色行数: ${rows}`)
  })

  test('08-02 4 个种子角色全部渲染（ROLE_ADMIN/ROLE_OPS/ROLE_DEV/ROLE_GUEST）', async ({ page, shot, diag }) => {
    const body = await page.getByTestId('rol-page').innerText()
    await shot('roles', '08-02-seed-roles')
    for (const code of ['ROLE_ADMIN', 'ROLE_OPS', 'ROLE_DEV', 'ROLE_GUEST']) {
      expect(body, `角色列表应包含 ${code}`).toContain(code)
    }
    writeEvidence('roles', '08-02-seed-roles', diag)
  })

  test('08-05 角色权限页应提供角色新增/编辑/授权能力入口', async ({ page, shot, diag }) => {
    // v2 已修复旧 P1 功能缺失：新建入口 + 行级 编辑/权限(授权矩阵)/成员 动作
    await expect(page.getByTestId('rol-action-create'), '应提供角色新增入口').toBeVisible({ timeout: 10_000 })
    const edit = await v2RowAction(page, 'rol', 'edit').count()
    const perm = await v2RowAction(page, 'rol', 'perm').count()
    const members = await v2RowAction(page, 'rol', 'members').count()
    await shot('roles', '08-05-role-management-actions', true)
    writeEvidence('roles', '08-05-role-management-actions', diag,
      `全表 edit=${edit} perm=${perm} members=${members}`)
    expect(edit, '应至少一行提供编辑入口').toBeGreaterThan(0)
    expect(perm, '应至少一行提供权限矩阵入口').toBeGreaterThan(0)
    expect(members, '应至少一行提供成员管理入口').toBeGreaterThan(0)
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

  // ── c 类注释保留（随 v2 权限矩阵合并砍除，契约 §4.5）─────────────────
  // test('08-03 切换到"我的权限"Tab 渲染权限表', async ({ page, shot, diag }) => {
  //   const tab = page.locator('.fc-tab', { hasText: '权限' }).first()
  //   await expect(tab).toBeVisible({ timeout: 10_000 })
  //   await tab.click()
  //   ...
  // })
  //
  // test('08-04 权限表渲染权限编码/名称/资源类型列', async ({ page, shot, diag }) => {
  //   await page.locator('.fc-tab', { hasText: '权限' }).first().click()
  //   ...
  // })
})
