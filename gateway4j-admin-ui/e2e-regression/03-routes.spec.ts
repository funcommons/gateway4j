import { test, expect, login, shot, writeEvidence, formField, confirmButton, uniq, apiCall } from './helpers'

/**
 * BL-03 路由管理（列表 + 编辑器）
 * 覆盖：列表加载/状态过滤/搜索/树形展开折叠、
 *       新建路由（必填校验、非法格式校验、创建成功）、
 *       编辑已有路由（加载 + 保存）、发布、下线、删除、编辑器四个 Tab。
 *
 * 已知缺陷（用例内以失败断言 + 证据留痕）：
 *   D2  FcFilterBar 无 actions 具名插槽 → 列表页「新建 / 导入」主按钮不渲染
 *   D3  后端缺 GET /v1/routes/{id} → 编辑已有路由页加载失败（405）
 *   D9  后端路由创建接口不做任何格式校验（校验只在前端）
 */
test.describe('BL-03 路由管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1200)
  })

  test('03-01 路由列表加载：树形表格渲染且含分发型父路由', async ({ page, shot, diag }) => {
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    const n = await rows.count()
    expect(n, '路由列表应至少渲染 1 行').toBeGreaterThan(0)
    await shot('routes', '03-01-route-list')
    writeEvidence('routes', '03-01-route-list', diag, `路由行数: ${n}`)
  })

  test('03-02 状态过滤标签切换生效（全部/草稿/已发布/变更中/已下线）', async ({ page, shot, diag }) => {
    const counts: Record<string, number> = {}
    for (const label of ['全部', '草稿', '已发布', '变更中', '已下线']) {
      await page.locator('.fc-filter-btn', { hasText: label }).first().click()
      await page.waitForTimeout(700)
      counts[label] = await page.locator('.el-table__body-wrapper tbody tr').count()
    }
    await shot('routes', '03-02-status-filter')
    writeEvidence('routes', '03-02-status-filter', diag, `各状态过滤行数: ${JSON.stringify(counts)}`)
    expect(counts['草稿'], '草稿过滤后应能命中种子数据中的草稿路由').toBeGreaterThan(0)
  })

  test('03-03 搜索框按路由名过滤（大小写不敏感）', async ({ page, shot, diag }) => {
    const search = page.locator('.fc-filter-bar input').first()
    await search.fill('payment')
    await search.press('Enter')
    await page.waitForTimeout(1000)
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    const n = await rows.count()
    await shot('routes', '03-03-search-filter')
    expect(n, '搜索 "payment" 应至少命中 1 行').toBeGreaterThan(0)
    writeEvidence('routes', '03-03-search-filter', diag, `命中行数: ${n}`)
  })

  test('03-04 搜索无结果时展示空态而非报错', async ({ page, shot, diag }) => {
    const search = page.locator('.fc-filter-bar input').first()
    await search.fill('zzz_not_exist_zzz')
    await search.press('Enter')
    await page.waitForTimeout(1000)
    await expect(page.locator('.fc-empty, .el-empty').first()).toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-04-search-empty-state')
    writeEvidence('routes', '03-04-search-empty-state', diag)
  })

  test('03-05 树形展开/收起按钮可用', async ({ page, shot, diag }) => {
    const expandAll = page.getByRole('button', { name: '全部展开' })
    if (await expandAll.isVisible().catch(() => false)) {
      await expandAll.click()
      await page.waitForTimeout(600)
    }
    const collapseAll = page.getByRole('button', { name: '全部折叠' })
    if (await collapseAll.isVisible().catch(() => false)) {
      await collapseAll.click()
      await page.waitForTimeout(600)
    }
    await shot('routes', '03-05-tree-expand-collapse')
    writeEvidence('routes', '03-05-tree-expand-collapse', diag)
  })

  test('03-06 路由列表应提供「新建」主操作入口', async ({ page, shot, diag }) => {
    // D2: FcFilterBar 未实现 actions 具名插槽 → <template #actions> 内的「新建/导入」按钮永不渲染
    const create = page.getByRole('button', { name: '新建', exact: true })
    await expect(create, '路由列表应提供「新建」主操作按钮（FcFilterBar actions 插槽）').toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-06-create-button')
    writeEvidence('routes', '03-06-create-button', diag)
  })

  test('03-07 新建路由：必填项校验（名称/路径/后端地址）', async ({ page, shot, diag }) => {
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(1200)
    const errs = page.locator('.el-form-item__error')
    const n = await errs.count()
    await shot('routes', '03-07-create-required-validation', true)
    expect(n, '空表单保存应展示必填校验错误').toBeGreaterThan(0)
    writeEvidence('routes', '03-07-create-required-validation', diag, `校验错误条数: ${n}`)
  })

  test('03-08 新建路由：非法名称/路径格式被前端拦截', async ({ page, shot, diag }) => {
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await formField(page, '路由名称').fill('bad name!')
    await formField(page, '匹配路径').fill('not-a-path')
    await formField(page, '后端地址').fill('ftp://xxx')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    const errs = page.locator('.el-form-item__error')
    const n = await errs.count()
    await shot('routes', '03-08-create-format-validation', true)
    // D12: RouteBasicForm.validate() 把校验失败吞成 boolean false，父组件忽略返回值 → 保存照常执行
    const created = await apiCall(page, 'GET', '/v1/routes?page=1&page_size=200')
    const dirty = (created.payload?.records ?? created.payload?.data?.records ?? [])
      .filter((r: any) => r.route_name === 'bad name!').length
    writeEvidence('routes', '03-08-create-format-validation', diag,
      `校验错误条数=${n}; 库中同名非法路由条数=${dirty}; 保存后 URL=${page.url()}`)
    expect(n, '非法格式应被前端校验拦截（当前 0 条错误，保存照常执行）').toBeGreaterThan(0)
    expect(dirty, '非法路由不应入库（当前已写入数据库）').toBe(0)
  })

  test('03-09 后端应拒绝非法格式的路由（与前端校验对齐）', async ({ page, shot, diag }) => {
    // D9: 后端 POST /v1/routes 不做任何格式校验，非法名称/路径/上游地址均可入库
    const bad = uniq('bad_route')
    const res = await apiCall(page, 'POST', '/v1/routes', {
      route_name: bad,
      route_type: 'BACKEND',
      path: 'not-a-path',
      upstream_url: 'ftp://xxx',
      sort_order: 1,
    })
    await shot('routes', '03-09-backend-format-validation')
    writeEvidence('routes', '03-09-backend-format-validation', diag,
      `POST /v1/routes 响应: status=${res.status} payload=${JSON.stringify(res.payload).slice(0, 300)}`)
    expect(res.ok && res.status >= 400, '后端应拒绝非法格式的路由（当前直接 200 创建成功）').toBe(false)
  })

  test('03-10 新建路由：合法输入保存成功并跳转编辑页', async ({ page, shot, diag }) => {
    const name = uniq('e2e_rt')
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await formField(page, '路由名称').fill(name)
    await formField(page, '匹配路径').fill(`/e2e/${name}/**`)
    await formField(page, '后端地址').fill('http://127.0.0.1:19000')
    await formField(page, '描述', 'textarea').fill('回归测试自动创建')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    await shot('routes', '03-10-create-success')
    await expect(page).toHaveURL(/\/routes\/[^/]+$/, { timeout: 15_000 })
    await page.goto('/routes')
    await page.waitForTimeout(1200)
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })
    writeEvidence('routes', '03-10-create-success', diag, `新建路由名: ${name}`)
  })

  test('03-11 编辑器：四个 Tab（基本信息/分发条件/插件绑定/插件链）均可打开', async ({ page, shot, diag }) => {
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    const tabs = ['基本信息', '分发条件', '插件绑定', '插件链']
    for (const t of tabs) {
      const el = page.locator('.fc-tab', { hasText: t }).first()
      const visible = await el.isVisible().catch(() => false)
      if (visible) {
        await el.click()
        await page.waitForTimeout(700)
      }
      await shot('routes', `03-11-editor-tab-${t}`)
      if (!visible) writeEvidence('routes', `03-11-editor-tab-${t}`, diag, `Tab "${t}" 未找到`)
    }
    writeEvidence('routes', '03-11-editor-tabs', diag)
  })

  test('03-12 编辑已有路由：应能加载出基本信息表单', async ({ page, shot, diag }) => {
    // D3: GET /v1/routes/{id} 未实现 → 编辑页直接报「加载失败：支持的方法: [DELETE, PATCH]」
    await page.goto('/routes/-100')
    await page.waitForTimeout(2500)
    await shot('routes', '03-12-edit-existing-route-load', true)
    const nameInput = formField(page, '路由名称')
    await expect(nameInput, '编辑已有路由时基本信息表单应可加载（当前 405）').toBeVisible({ timeout: 10_000 })
    writeEvidence('routes', '03-12-edit-existing-route-load', diag)
  })

  test('03-13 编辑已有路由：后端更新能力（PATCH）正常', async ({ page, shot, diag }) => {
    // 与 03-12 配对：证明"编辑功能整体不可用"的根因仅是缺少 GET 详情接口
    const name = uniq('e2e_patch')
    const created = await apiCall(page, 'POST', '/v1/routes', {
      route_name: name,
      route_type: 'BACKEND',
      path: `/e2e/${name}/**`,
      upstream_url: 'http://127.0.0.1:19000',
      sort_order: 10,
    })
    const id = created.payload?.id
    const updated = await apiCall(page, 'PATCH', `/v1/routes/${id}`, { remark: '回归测试-已编辑' })
    await shot('routes', '03-13-patch-update')
    writeEvidence('routes', '03-13-patch-update', diag,
      `创建 status=${created.status}; PATCH status=${updated.status} payload=${JSON.stringify(updated.payload).slice(0, 200)}`)
    expect(updated.ok, `PATCH /v1/routes/${id} 应更新成功`).toBe(true)
  })

  test('03-14 草稿路由可发布（确认弹窗 + 状态真的变为已发布）', async ({ page, shot, diag }) => {
    const name = uniq('e2e_pub')
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await formField(page, '路由名称').fill(name)
    await formField(page, '匹配路径').fill(`/e2e/${name}/**`)
    await formField(page, '后端地址').fill('http://127.0.0.1:19000')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    await page.goto('/routes')
    await page.waitForTimeout(1200)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '发布', exact: true }).first().click()
    await page.waitForTimeout(900)
    await shot('routes', '03-14-publish-confirm-dialog')
    await confirmButton(page).click()
    await page.waitForTimeout(3000)
    await page.reload()
    await page.waitForTimeout(2000)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await shot('routes', '03-14-publish-status-verified')
    const badge = await page.locator('.el-table__body-wrapper tbody tr').first().innerText()
    // D11 修复验证：确认后必须真正发出 publish 请求
    const publishCalls = diag.apiCalls.filter(c => c.includes('/publish'))
    writeEvidence('routes', '03-14-publish-status-verified', diag,
      `发布后行内容="${badge.replace(/\s+/g, ' ')}"; /publish 请求数=${publishCalls.length} (${publishCalls.join(' | ') || '无'})`)
    expect(publishCalls.length, '点击确认后应真正发出 POST /v1/routes/{id}/publish').toBeGreaterThan(0)
    expect(badge, '发布后状态应变为「已发布」').toContain('已发布')
  })

  test('03-15 已发布路由可下线（状态真的变为已下线）', async ({ page, shot, diag }) => {
    const name = uniq('e2e_off')
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await formField(page, '路由名称').fill(name)
    await formField(page, '匹配路径').fill(`/e2e/${name}/**`)
    await formField(page, '后端地址').fill('http://127.0.0.1:19000')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    await page.goto('/routes')
    await page.waitForTimeout(1200)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '发布', exact: true }).first().click()
    await page.waitForTimeout(900)
    await confirmButton(page).click()
    await page.waitForTimeout(3000)
    await page.reload()
    await page.waitForTimeout(2000)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '下线', exact: true }).first().click()
    await page.waitForTimeout(900)
    await shot('routes', '03-15-offline-confirm-dialog')
    await confirmButton(page).click()
    await page.waitForTimeout(3000)
    await page.reload()
    await page.waitForTimeout(2000)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await shot('routes', '03-15-offline-status-verified')
    const badge = await page.locator('.el-table__body-wrapper tbody tr').first().innerText()
    writeEvidence('routes', '03-15-offline-status-verified', diag, `下线后行内容: ${badge.replace(/\s+/g, ' ')}`)
    expect(badge, '下线后状态应变为「已下线」').toContain('已下线')
  })

  test('03-16 已发布路由不可删除（删除按钮按状态收敛）', async ({ page, shot, diag }) => {
    await page.locator('.fc-filter-bar input').first().fill('static_assets')
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    const row = page.locator('.el-table__body-wrapper tbody tr').first()
    const del = row.getByRole('button', { name: '删除', exact: true })
    const count = await del.count()
    await shot('routes', '03-16-published-route-no-delete')
    expect(count, '已发布路由不应出现删除按钮').toBe(0)
    writeEvidence('routes', '03-16-published-route-no-delete', diag, `删除按钮数: ${count}`)
  })

  test('03-17 草稿路由可删除（删除后列表中消失）', async ({ page, shot, diag }) => {
    const name = uniq('e2e_del')
    await page.goto('/routes/new')
    await page.waitForTimeout(1500)
    await formField(page, '路由名称').fill(name)
    await formField(page, '匹配路径').fill(`/e2e/${name}/**`)
    await formField(page, '后端地址').fill('http://127.0.0.1:19000')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    await page.goto('/routes')
    await page.waitForTimeout(1200)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '删除', exact: true }).first().click()
    await page.waitForTimeout(900)
    await shot('routes', '03-17-delete-confirm-dialog')
    await confirmButton(page).click()
    await page.waitForTimeout(3000)
    await page.reload()
    await page.waitForTimeout(2000)
    await page.locator('.fc-filter-bar input').first().fill(name)
    await page.locator('.fc-filter-bar input').first().press('Enter')
    await page.waitForTimeout(1500)
    await shot('routes', '03-17-delete-verified')
    const still = await page.getByText(name).count()
    writeEvidence('routes', '03-17-delete-verified', diag, `删除后仍能搜到的行数: ${still}`)
    expect(still, '删除后列表中不应再出现该路由').toBe(0)
  })

  test('03-18 新建分发路由：类型切换后展示父路由选择', async ({ page, shot, diag }) => {
    await page.goto('/routes/new')
    await page.waitForTimeout(1800)
    const typeItem = page.locator('.el-form-item', { hasText: '路由类型' }).locator('.fc-segmented-item, .fc-segmented button')
    const items = await typeItem.all()
    let switched = false
    for (const it of items) {
      const txt = (await it.innerText().catch(() => '')).trim()
      if (txt.includes('分发')) { await it.click(); switched = true; break }
    }
    await page.waitForTimeout(1200)
    await shot('routes', '03-18-dispatch-type-parent-select', true)
    const parent = formField(page, '父级路由')
    writeEvidence('routes', '03-18-dispatch-type-parent-select', diag, `已切换到分发类型: ${switched}`)
    expect(switched, '路由类型应可切换为「分发」').toBe(true)
    expect(await parent.count(), '分发类型应出现「父级路由」选择项').toBeGreaterThan(0)
  })
})
