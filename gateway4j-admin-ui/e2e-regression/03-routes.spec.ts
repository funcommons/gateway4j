import { test, expect, loginV2, shot, writeEvidence, uniq, apiCall, confirmPublishV2 } from './helpers'

/**
 * BL-03 路由管理（列表 + 向导 + 详情/编辑，v2 迁移版，P4e 步 3）
 * v2 页面：/v2/routes（列表 route-*）、/v2/routes/new（**S12-4 起的新建入口**，
 *          单页形态；S12-7c 将重写为 SCG RouteDefinition 1:1 编辑器）、
 *          /v2/routes/wizard（wizard-* 五步向导，**S12-4 起保留但不再是导航目标**）、
 *          /v2/routes/:id/detail（dtl-*，dtl-action-edit 开 RouteEditForm 编辑态 ref-*）、
 *          /v2/publish/:id（pub-* 独立发布页，confirmPublishV2 助手）。
 * 旧→v2 形态差异（2026-11-09 核源码）：
 *   - 旧 /routes/new 表单新建 → v2 五步向导：第 1 步必选模板（无模板时「下一步」disabled），
 *     分步校验错误统一落 wizard-step-error（03-07/03-08/03-18 按此重写）
 *   - 旧编辑器四 Tab → v2 Detail 页内嵌 RouteEditForm（基础信息/分发条件/插件绑定 + 插件链只读）
 *     （03-11/03-12 重写；dtl-action-edit 开编辑态，编辑态内 dtl-action-edit 隐藏）
 *   - 旧行内「更多」下拉 → v2 行展开区 card-actions 直排五钮（详情/调试/编辑画布/发布/复制配置）
 *   - 发布流：旧弹窗 → v2 独立页 /v2/publish/:id（pub-desc-input 必填 1~200 字 + pub-publish-btn）
 *   - 状态过滤：旧 5 段（含变更中）→ v2 4 段（全部/已发布/草稿/已下线，「变更中」不随迁）
 *   - 树形展开/收起：v2 无「全部展开/折叠」，逐行 route-expand-{id} 开合行内详情卡（03-05 重写）
 * v2 UI 缺口（记录不修业务，P4e 挂起待产品裁决）：
 *   - 路由「下线」「删除」在 v2 无 UI 入口（List 展开区/Detail 页均只有 详情/调试/画布/发布/复制），
 *     后端 POST /v1/routes/{id}/offline 与 DELETE 能力健在
 *     → 03-15/03-17 状态变更经 API 驱动 + v2 列表展示断言（UI 缺口在用例注释留痕）
 * 旧缺陷 D3/D9/D12 在现后端均已修复（GET /v1/routes/{id}=200、POST 非法格式 10100 拒单、
 * 前端向导分步拦截），对应断言转正向。
 *
 * ── S12-4/S12-5（2026-11-23）创建入口切换后的用例归属 ──────────────────────
 * 用户裁决「不要向导，要仿 k8s ingress 配置页」+「入口摘除旧向导」：
 *   - **03-06 改了**（唯一断言「列表页新建按钮 → 向导」这条链路的用例）：
 *     期望 URL 由 /v2/routes/wizard 改为 /v2/routes/new。**只断言目标路由**，
 *     不断言目标页内部 testid —— 该页在 S12-7c 会被重写为 SCG RouteDefinition 1:1 编辑器。
 *   - **03-07/03-08/03-10/03-14/03-17/03-18 保留**：它们直接 goto /v2/routes/wizard
 *     或走 wizardCreateRoute() 辅助函数，测的是**旧向导页仍可用**（裁决①：页面与路由项
 *     保留、可直达），与「哪个是入口」无关 → 不因入口切换而失效。
 *   - 新建入口的端到端验证（表单填写 → 提交 → 落库 → 谓词行 → 清理）**待 S12-8 补**
 *     （需等 S12-7b 批量 API + S12-7c 新表单落地后再写，现在写必然红）。
 */

/** 路由树递归按名找 id（v2 列表/树接口返回嵌套 children） */
function findRouteId(nodes: unknown, name: string): string {
  for (const n of (Array.isArray(nodes) ? nodes : []) as Array<{ id: unknown; route_name: string; children?: unknown }>) {
    if (n.route_name === name) return String(n.id)
    const hit = findRouteId(n.children, name)
    if (hit) return hit
  }
  return ''
}

/** 向导建一条 BACKEND 草稿路由（模板→匹配→转发→跳过插件→提交），返回路由名 */
async function wizardCreateRoute(page: import('@playwright/test').Page, name: string) {
  await page.goto('/v2/routes/wizard')
  await expect(page.getByTestId('wizard-step-1')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('wizard-template-basic').click()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('route-name').fill(name)
  await page.getByTestId('route-path').fill(`/e2e/${name}/**`)
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-3')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('route-upstream').fill('http://127.0.0.1:19000')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-4')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-5')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('wizard-submit').click()
  await expect(page).toHaveURL(/\/v2\/routes$/, { timeout: 15_000 })
  return name
}

/** 列表按名过滤并展开该行（v2 搜索=客户端过滤，无需回车） */
async function searchAndExpand(page: import('@playwright/test').Page, name: string) {
  const search = page.getByLabel('搜路径 / 名称…')
  await expect(search).toBeVisible({ timeout: 15_000 })
  await search.fill(name)
  await page.waitForTimeout(900)
  const row = page.locator('[data-testid^="route-row-"]').filter({ hasText: name })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await row.locator('[data-testid^="route-expand-"]').click()
  const detail = page.locator('[data-testid^="route-detail-"]')
  await expect(detail).toBeVisible({ timeout: 10_000 })
  return detail
}

test.describe('BL-03 路由管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1000)
  })

  test('03-01 路由列表加载：语义表格渲染且含分发型种子路由', async ({ page, shot, diag }) => {
    const rows = await page.locator('[data-testid^="route-row-"]').count()
    await shot('routes', '03-01-route-list')
    expect(rows, '路由列表应至少渲染 1 行').toBeGreaterThan(0)
    await expect(page.locator('[data-testid="route-row--100"]'), '种子分发路由 api_gateway(-100) 应在列表中').toBeVisible()
    writeEvidence('routes', '03-01-route-list', diag, `路由行数: ${rows}`)
  })

  test('03-02 状态过滤标签切换生效（全部/已发布/草稿/已下线，v2 裁除变更中）', async ({ page, shot, diag }) => {
    const counts: Record<string, number> = {}
    for (const label of ['全部', '已发布', '草稿', '已下线']) {
      await page.getByRole('radio', { name: label }).click()
      await page.waitForTimeout(700)
      counts[label] = await page.locator('[data-testid^="route-row-"]').count()
    }
    await shot('routes', '03-02-status-filter')
    writeEvidence('routes', '03-02-status-filter', diag,
      `各状态过滤行数: ${JSON.stringify(counts)}; v2 FcSegmented 仅 4 段（旧「变更中」不随迁）`)
    expect(counts['草稿'], '草稿过滤后应能命中种子数据中的草稿路由').toBeGreaterThan(0)
    expect(counts['已下线'], '已下线过滤后应能命中种子/历史下线路由').toBeGreaterThan(0)
  })

  test('03-03 搜索框按路由名过滤（大小写不敏感）', async ({ page, shot, diag }) => {
    const search = page.getByLabel('搜路径 / 名称…')
    await search.fill('payment')
    await page.waitForTimeout(1000)
    const rows = page.locator('[data-testid^="route-row-"]')
    const n = await rows.count()
    await shot('routes', '03-03-search-filter')
    expect(n, '搜索 "payment" 应至少命中 1 行').toBeGreaterThan(0)
    writeEvidence('routes', '03-03-search-filter', diag, `命中行数: ${n}`)
  })

  test('03-04 搜索无结果时展示空态而非报错', async ({ page, shot, diag }) => {
    const search = page.getByLabel('搜路径 / 名称…')
    await search.fill('zzz_not_exist_zzz')
    await page.waitForTimeout(1000)
    await expect(page.getByTestId('route-empty')).toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-04-search-empty-state')
    writeEvidence('routes', '03-04-search-empty-state', diag)
  })

  test('03-05 行级展开/收起可用（v2 逐行详情卡，无全局展开钮）', async ({ page, shot, diag }) => {
    const expandBtn = page.locator('[data-testid="route-expand--100"]')
    const detail = page.locator('[data-testid="route-detail--100"]')
    await expect(expandBtn).toBeVisible({ timeout: 10_000 })
    await expect(detail).toHaveCount(0)
    await expandBtn.click()
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await expect(expandBtn, '展开后 aria-expanded 应为 true').toHaveAttribute('aria-expanded', 'true')
    await shot('routes', '03-05-row-expand')
    await expandBtn.click()
    await expect(detail, '再次点击应收起详情').toBeHidden({ timeout: 10_000 })
    await shot('routes', '03-05-row-collapse')
    writeEvidence('routes', '03-05-row-expand-collapse', diag, '-100 行展开→详情卡可见→收起→隐藏')
  })

  test('03-06 路由列表应提供「新建路由」主操作入口', async ({ page, shot, diag }) => {
    // S12-4：创建入口已从旧五步向导切到单页 /v2/routes/new
    //（裁决①：旧 /v2/routes/wizard 页面与路由项保留、可直达，但不再是任何导航目标）。
    // 本断言只钉「入口 → 目标路由」这条链路，与目标页内部形态解耦
    //（S12-7c 新表单会重写该页结构 → 不在此断言页内 testid）。
    const create = page.getByTestId('route-create')
    await expect(create, '路由列表应提供「新建路由」主操作按钮').toBeVisible({ timeout: 10_000 })
    await create.click()
    await expect(page, '点击「新建路由」应跳 /v2/routes/new').toHaveURL(/\/v2\/routes\/new$/, { timeout: 10_000 })
    await shot('routes', '03-06-create-button')
    writeEvidence('routes', '03-06-create-button', diag, '点击后跳转 /v2/routes/new（旧向导不再作为入口）')
  })

  test('03-07 新建路由：第 1 步必选模板 + 必填项分步校验', async ({ page, shot, diag }) => {
    // S12-4/S12-5 保留：直接 goto 旧向导页（裁决①：页面保留、可直达）→ 测「旧向导仍可用」，
    // 与「谁是新建入口」无关（入口链路已由 03-06 改断言 /v2/routes/new）。
    await page.goto('/v2/routes/wizard')
    await expect(page.getByTestId('wizard-step-1')).toBeVisible({ timeout: 15_000 })
    // v2 门禁：未选模板时「下一步」disabled（旧表单页无此门禁）
    await expect(page.getByTestId('wizard-next'), '未选模板时下一步应禁用').toBeDisabled()
    await page.getByTestId('wizard-template-basic').click()
    await expect(page.getByTestId('wizard-next')).toBeEnabled()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible({ timeout: 10_000 })
    // 名称/路径全空直接下一步 → 分步校验错误条（旧 .el-form-item__error 的 v2 等价物）
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-error')).toBeVisible({ timeout: 10_000 })
    const err = (await page.getByTestId('wizard-step-error').innerText()).trim()
    await shot('routes', '03-07-create-required-validation', true)
    writeEvidence('routes', '03-07-create-required-validation', diag, `校验错误文案: ${err}`)
    expect(err.length, '空表单保存应展示必填校验错误').toBeGreaterThan(0)
    expect(await page.getByTestId('wizard-step-2').getAttribute('aria-current'), '应仍留在第 2 步').toBe('step')
  })

  test('03-08 新建路由：非法名称/路径格式被前端拦截', async ({ page, shot, diag }) => {
    // S12-4/S12-5 保留：同上（直接 goto 旧向导页，测旧页面前端校验仍生效）。
    await page.goto('/v2/routes/wizard')
    await expect(page.getByTestId('wizard-step-1')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wizard-template-basic').click()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('route-name').fill('bad name!')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-error')).toBeVisible({ timeout: 10_000 })
    const nameErr = (await page.getByTestId('wizard-step-error').innerText()).trim()
    await page.getByTestId('route-name').fill(uniq('e2e_bad'))
    await page.getByTestId('route-path').fill('not-a-path')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-error')).toBeVisible({ timeout: 10_000 })
    const pathErr = (await page.getByTestId('wizard-step-error').innerText()).trim()
    const stillStep2 = await page.getByTestId('wizard-step-2').getAttribute('aria-current')
    await shot('routes', '03-08-create-format-validation', true)
    // 库中不应出现非法名路由（v2 分步拦截，无法走到提交）
    const all = await apiCall(page, 'GET', '/v1/routes')
    const dirty = JSON.stringify(all.payload ?? all.payload?.data ?? []).includes('bad name!')
    writeEvidence('routes', '03-08-create-format-validation', diag,
      `名称校验="${nameErr}"; 路径校验="${pathErr}"; 仍在第2步=${stillStep2 === 'step'}; 库中同名非法路由=${dirty}`)
    expect(nameErr, '非法名称应被前端拦截').toContain('路由名称')
    expect(pathErr, '非法路径应被前端拦截').toContain('匹配路径')
    expect(stillStep2, '校验不过不得进入下一步').toBe('step')
    expect(dirty, '非法路由不应入库').toBe(false)
  })

  test('03-09 后端拒绝非法格式的路由（与前端校验对齐，D9 已修复）', async ({ page, shot, diag }) => {
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
    // 信封契约：成功=裸数据（HTTP 200 无包裹），业务拒绝=HTTP 200 + {code:10100, success:false}
    const rejected = res.status >= 400 || res.payload?.success === false
    expect(rejected, '后端应拒绝非法格式的路由（10100 请求参数错误，逐字段 FORMAT_INVALID）').toBe(true)
    expect(Number(res.payload?.code), '拒绝应落业务码 10100（请求参数错误）').toBe(10100)
  })

  test('03-10 新建路由：向导合法输入创建成功并回到列表可见', async ({ page, shot, diag }) => {
    // S12-4/S12-5 保留：走旧向导建路由 → 测「旧向导建路由链路仍可用」。
    // （新建入口链路由 03-06 断言 + 03-routes-ingress.spec.ts 覆盖。）
    const name = uniq('e2e_rt')
    await wizardCreateRoute(page, name)
    await shot('routes', '03-10-create-success')
    writeEvidence('routes', '03-10-create-success', diag, `新建路由名: ${name}; 提交后 URL=${page.url()}`)
    // 创建成功 → 跳回列表；按名过滤可见
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    const row = page.locator('[data-testid^="route-row-"]').filter({ hasText: name })
    await expect(row, '新路由应出现在列表中').toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-10-create-visible-in-list')
  })

  test('03-11 编辑态：基础信息/分发条件/插件绑定三分区 + 插件链只读区均可打开', async ({ page, shot, diag }) => {
    await page.goto('/v2/routes/-100/detail')
    await expect(page.getByTestId('dtl-name')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('dtl-action-edit').click()
    await expect(page.getByTestId('dtl-edit-panel')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('ref-form')).toBeVisible()
    const tabToSection: Array<[string, string]> = [
      ['基础信息', 'ref-section-basic'],
      ['分发条件', 'ref-section-conditions'],
      ['插件绑定', 'ref-section-bindings'],
    ]
    for (const [tab, section] of tabToSection) {
      await page.getByTestId('ref-section-nav').locator('.fc-tab', { hasText: tab }).click()
      await page.waitForTimeout(600)
      await expect(page.getByTestId(section), `分区「${tab}」应可打开`).toBeVisible({ timeout: 10_000 })
      await shot('routes', `03-11-edit-section-${section}`)
    }
    await expect(page.getByTestId('ref-chain'), '插件链只读区应常驻').toBeVisible()
    writeEvidence('routes', '03-11-editor-tabs', diag,
      'v2 Detail 内嵌 RouteEditForm：三分区 Tab 切换正常 + ref-chain 只读区可见')
  })

  test('03-12 编辑已有路由：应能加载出基本信息表单（D3 已修复）', async ({ page, shot, diag }) => {
    await page.goto('/v2/routes/-100/detail')
    await expect(page.getByTestId('dtl-name')).toHaveText('api_gateway')
    await expect(page.getByTestId('dtl-status')).toHaveText('PUBLISHED')
    await page.getByTestId('dtl-action-edit').click()
    await expect(page.getByTestId('dtl-edit-panel')).toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-12-edit-existing-route-load')
    // FcInput testid 落原生 input：裸 getByTestId 断言值（禁再包 .locator('input')）
    await expect(page.getByTestId('ref-input-route_name'), '编辑已有路由时基本信息表单应回填').toHaveValue('api_gateway', { timeout: 10_000 })
    writeEvidence('routes', '03-12-edit-existing-route-load', diag)
  })

  test('03-13 编辑已有路由：后端更新能力（PATCH）正常', async ({ page, shot, diag }) => {
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

  test('03-14 草稿路由可发布（v2 独立发布页 + 状态真的变为已发布）', async ({ page, shot, diag }) => {
    // S12-4/S12-5 保留：用例意图是「草稿 → 发布」，建路由用旧向导只是手段（发布流未变）。
    const name = uniq('e2e_pub')
    await wizardCreateRoute(page, name)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    // 行展开区 card-actions → act-publish → /v2/publish/:id（v2 发布不再是弹窗）
    const detail = await searchAndExpand(page, name)
    await detail.getByTestId('act-publish').click()
    await page.waitForURL(/\/v2\/publish\//, { timeout: 10_000 })
    await shot('routes', '03-14-publish-page')
    await confirmPublishV2(page)
    await page.waitForTimeout(2500)
    // 回列表验证状态真实变化（v2 发布成功后停留发布页，需主动返回）
    await page.goto('/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    const row = page.locator('[data-testid^="route-row-"]').filter({ hasText: name })
    await shot('routes', '03-14-publish-status-verified')
    // D11 修复验证：确认后必须真正发出 publish 请求
    const publishCalls = diag.apiCalls.filter(c => c.includes('/publish') && c.includes(' POST '))
    writeEvidence('routes', '03-14-publish-status-verified', diag,
      `/publish 请求数=${publishCalls.length} (${publishCalls.join(' | ') || '无'})`)
    expect(publishCalls.length, '确认发布后应真正发出 POST /v1/routes/{id}/publish').toBeGreaterThan(0)
    await expect(row.locator('[data-testid="route-status"]'), '发布后状态应变为「已发布」').toContainText('已发布', { timeout: 10_000 })
  })

  test('03-15 已发布路由状态可下线（v2 无 UI 入口缺口：API 驱动 + 列表展示断言）', async ({ page, shot, diag }) => {
    // v2 UI 缺口（记录不修业务）：List/Detail 均无「下线」入口，后端 POST /offline 健在。
    // 保留原用例意图「已发布路由状态真的变为已下线」：发布走 v2 发布页 UI，下线经 API，
    // 断言 v2 列表真实展示已下线徽标。
    const name = uniq('e2e_off')
    const created = await apiCall(page, 'POST', '/v1/routes', {
      route_name: name, route_type: 'BACKEND', path: `/e2e/${name}/**`,
      upstream_url: 'http://127.0.0.1:19000', sort_order: 10,
    })
    const id = String(created.payload?.id)
    // API 现造的路由不在已加载的客户端过滤列表里，先刷新再搜索
    await page.reload()
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)
    const detail = await searchAndExpand(page, name)
    await detail.getByTestId('act-publish').click()
    await page.waitForURL(/\/v2\/publish\//, { timeout: 10_000 })
    await confirmPublishV2(page)
    await page.waitForTimeout(2500)
    // v2 无下线入口 → API 下线（缺口留痕）
    const offline = await apiCall(page, 'POST', `/v1/routes/${id}/offline`)
    await page.goto('/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    const row = page.locator('[data-testid^="route-row-"]').filter({ hasText: name })
    await shot('routes', '03-15-offline-status-verified')
    writeEvidence('routes', '03-15-offline-status-verified', diag,
      `POST /offline status=${offline.status}; 下线后行过滤命中=${await row.count()}; v2 下线 UI 入口缺失已记录`)
    expect(offline.ok, `POST /v1/routes/${id}/offline 应成功`).toBe(true)
    await expect(row.locator('[data-testid="route-status"]'), '下线后状态应展示「已下线」').toContainText('已下线', { timeout: 10_000 })
  })

  test('03-16 已发布路由不提供删除动作（v2 行动作为固定五钮集合）', async ({ page, shot, diag }) => {
    // v2 形态：行展开区动作固定为 详情/调试/编辑画布/发布/复制配置（无删除项，任意状态一致）；
    // 断言保留旧意图「已发布行的动作集合中不出现删除」。
    const detail = await searchAndExpand(page, 'static_assets')
    const acts = detail.locator('[data-testid^="act-"]')
    const labels = (await acts.allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim())
    await expect(detail.getByTestId('act-publish'), '已发布路由应仍提供发布动作').toBeVisible()
    await shot('routes', '03-16-published-route-no-delete')
    writeEvidence('routes', '03-16-published-route-no-delete', diag,
      `动作项: ${labels.join(' | ')}; v2 删除入口整体未随迁（缺口已记录）`)
    expect(labels.some(t => t.includes('删除')), '已发布路由的动作集合中不应出现删除项').toBe(false)
    expect(labels.length, '已发布路由应仍提供其它动作').toBeGreaterThan(0)
  })

  test('03-17 草稿路由可删除（v2 无 UI 入口缺口：API 驱动 + 列表消失断言）', async ({ page, shot, diag }) => {
    // v2 UI 缺口（记录不修业务）：路由删除无 UI 入口。保留意图「草稿路由可删除且从列表消失」：
    // 创建走向导 UI，删除经 API（后端 DELETE 健在），断言 v2 列表不再出现。
    // S12-4/S12-5 保留：建路由手段仍是旧向导（用例测的是删除能力，与创建入口无关）。
    const name = uniq('e2e_del')
    await wizardCreateRoute(page, name)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    const all = await apiCall(page, 'GET', '/v1/routes')
    const id = findRouteId(all.payload ?? all.payload?.data, name)
    expect(id, '按名应能定位新草稿路由 id').not.toBe('')
    const del = await apiCall(page, 'DELETE', `/v1/routes/${id}`)
    await page.goto('/v2/routes')
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)
    await page.getByLabel('搜路径 / 名称…').fill(name)
    await page.waitForTimeout(900)
    await shot('routes', '03-17-delete-verified')
    const still = await page.locator('[data-testid^="route-row-"]').filter({ hasText: name }).count()
    writeEvidence('routes', '03-17-delete-verified', diag,
      `DELETE status=${del.status}; 删除后仍能搜到的行数: ${still}; v2 删除 UI 入口缺失已记录`)
    expect(del.ok, `DELETE /v1/routes/${id} 应成功`).toBe(true)
    expect(still, '删除后列表中不应再出现该路由').toBe(0)
  })

  test('03-18 分发路由形态：向导分发模板出分支配置 + 编辑态父路由选择在', async ({ page, shot, diag }) => {
    // v2 无「路由类型切换后出现父路由」的表单联动：分发=模板选择（向导第 3 步出分支配置）；
    // 父路由选择在编辑态 RouteEditForm（ref-input-parent_route_id，仅分发路由可作父）。
    // S12-4/S12-5 保留：DISPATCH 分发模板是 gateway4j 扩展编排（SCG 无等价物），
    // 只存在于旧向导 → 该用例继续直入旧向导页。
    await page.goto('/v2/routes/wizard')
    await expect(page.getByTestId('wizard-step-1')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('wizard-template-dispatch').click()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('route-name').fill(uniq('e2e_dispatch'))
    await page.getByTestId('route-path').fill('/e2e/dispatch/**')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-3')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('wizard-branch'), '分发模板应出现分支配置形态').toBeVisible({ timeout: 10_000 })
    await shot('routes', '03-18-dispatch-type-parent-select', true)
    // 编辑态：分发路由 -100 的父路由选择控件在
    await page.goto('/v2/routes/-100/detail')
    await expect(page.getByTestId('dtl-name')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('dtl-action-edit').click()
    await expect(page.getByTestId('ref-form')).toBeVisible({ timeout: 10_000 })
    // FcSelect 两层结构：断言取 .first()（步 2 铁律）
    const parent = page.getByTestId('ref-input-parent_route_id').first()
    await expect(parent, '编辑态应提供「父路由」选择项').toBeVisible({ timeout: 10_000 })
    writeEvidence('routes', '03-18-dispatch-type-parent-select', diag,
      '向导分发模板→wizard-branch 分支配置可见；编辑态 ref-input-parent_route_id 可见')
  })
})
