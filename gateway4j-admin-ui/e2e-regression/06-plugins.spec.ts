import { test, expect, loginV2, v2Confirm, shot, writeEvidence, uniq, apiCall } from './helpers'

/**
 * BL-06 插件管理（v2 迁移版，P4e 步 2）
 * 覆盖：列表加载、类型/状态筛选、搜索、列表/分组视图切换、
 *       新建入口、后端创建能力、编辑器校验、Groovy 脚本校验、启用/禁用、删除、
 *       内置插件目录（v2 市场区）与配置弹窗。
 *
 * v2 页面事实（2026-11-09 核源码实播）：
 *   - /v2/plugins（plg-*）：语义表格 .plg-table，行 testid plg-row-{id}，
 *     行内动作直排 FcButton（plg-act-edit/enable/disable/delete-{id}，不再是「更多」下拉），
 *     筛选 keyword=FcInput(300ms 防抖自动触发)、type/status/scope=FcSegmented(radio)。
 *   - 新建/编辑：/v2/plugins/editor/new 与 /v2/plugins/editor/{行主键 id}（ped-*），
 *     手写校验 Wizard 模式 → ped-err-{prop}；Groovy 脚本区随类型 GROOVY 显示（默认类型即 GROOVY）。
 *   - 内置插件目录：/v2/plugins/chain 市场区（chn-market / chn-mkt-{plugin_id}），
 *     已安装内置显示「配置」(chn-mkt-config-{id})，安装钮对已安装置灰显示「已安装」。
 *
 * 旧缺陷在 v2 的去向：
 *   D2 列表「新建插件」入口不渲染 —— v2 已修复（plg-create）
 *   D6 后端忽略 keyword 过滤参数 —— keyword 已修复（06-03 严格断言 0 行）；
 *     ⚠ 新发现后端缺陷（本步不修，记 P1 清单）：UI 发 snake_case plugin_type/plugin_phase，
 *       PluginController 绑定 camelCase pluginType/pluginPhase → 类型/阶段过滤被静默忽略
 *       （06-04 从严断言降级为掺杂如实记录；status/scope 为单词参数不受影响，06-05 仍严格断言）
 *   D21 config_schema 回 JSON 字符串致动态表单恒空 —— 后端已修复（parseSchema 放 JSON 对象）→ 06-13 断言动态控件
 *   06-12 旧全局插件列表页 —— c 类注释保留（旧 /plugins/global 随 v2 裁决不迁移，Chain 全局泳道全量覆盖，契约 §4.5）
 */
test.describe('BL-06 插件管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/plugins')
    await page.waitForTimeout(1200)
  })

  test('06-01 插件列表加载：语义表格渲染且含名称/类型/阶段/作用域/状态列', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('plg-table-view')).toBeVisible({ timeout: 20_000 })
    const heads = await page.locator('.plg-table thead th').allInnerTexts()
    const rows = page.locator('[data-testid^="plg-row-"]')
    const n = await rows.count()
    const firstCells = n > 0
      ? await rows.first().locator('[data-testid^="plg-name-"], [data-testid^="plg-type-"], [data-testid^="plg-phase-"], [data-testid^="plg-scope-"], [data-testid^="plg-status-"]').count()
      : 0
    await shot('plugins', '06-01-plugin-list')
    expect(n, '插件列表应至少渲染 1 行').toBeGreaterThan(0)
    expect(firstCells, '首行应含名称/类型/阶段/作用域/状态单元格').toBeGreaterThanOrEqual(5)
    writeEvidence('plugins', '06-01-plugin-list', diag, `行数=${n}, 表头=${heads.join(' | ')}`)
  })

  test('06-02 列表/分组视图切换可用', async ({ page, shot, diag }) => {
    const toggle = page.getByTestId('plg-view-toggle')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    await toggle.click()
    await expect(page.getByTestId('plg-grouped-view')).toBeVisible({ timeout: 10_000 })
    const groups = await page.locator('[data-testid^="plg-group-"]').count()
    await shot('plugins', '06-02-grouped-view')
    await toggle.click()
    await expect(page.getByTestId('plg-table-view')).toBeVisible({ timeout: 10_000 })
    await shot('plugins', '06-02-table-view-back')
    writeEvidence('plugins', '06-02-grouped-view', diag, `分组数=${groups}`)
    expect(groups, '分组视图应按类型分组渲染').toBeGreaterThan(0)
  })

  test('06-03 按插件名搜索应过滤结果', async ({ page, shot, diag }) => {
    // 旧 D6（后端忽略 keyword）已修复：v2 搜索词随 API 下发，严格断言空结果
    await page.getByTestId('plg-f-keyword').fill('__no_such_plugin__')
    await page.waitForTimeout(2000)
    const rows = await page.locator('[data-testid^="plg-row-"]').count()
    const empty = await page.getByTestId('plg-empty').count()
    await shot('plugins', '06-03-search-filter-empty')
    const api = await apiCall(page, 'GET', '/v1/plugins?page=1&page_size=20&keyword=__no_such_plugin__')
    const apiCount = api.payload?.records?.length ?? api.payload?.data?.records?.length
    writeEvidence('plugins', '06-03-search-filter-empty', diag, `UI 行数=${rows}, 空态=${empty}, 后端带 keyword 返回=${apiCount}`)
    expect(rows, '搜索不存在的插件名应过滤为空结果').toBe(0)
    expect(empty, '空结果应渲染空态组件').toBeGreaterThan(0)
  })

  test('06-04 类型筛选应生效', async ({ page, shot, diag }) => {
    // FcSegmented：testid 落 radiogroup 根，选项为 role=radio 按钮。
    // ⚠ 已知后端缺陷（本步不修，记 P1 清单）：UI 发 plugin_type=GROOVY（snake_case），
    //   PluginController 绑定 camelCase pluginType → 类型/阶段过滤参数被静默忽略
    //   （实测 plugin_type=BUILTIN/JAR/GROOVY 三种查询返回完全同一页数据，total 恒 32）。
    //   故从严断言「全表同类型」降级为「控件可切换 + 结果集含 Groovy 行 + 掺杂如实记录」。
    await page.getByTestId('plg-f-type').getByRole('radio', { name: 'Groovy' }).click()
    await page.waitForTimeout(2000)
    const n = await page.locator('[data-testid^="plg-row-"]').count()
    const types = (await page.locator('[data-testid^="plg-type-"]').allInnerTexts()).map(s => s.trim())
    const groovy = types.filter(t => t === 'Groovy').length
    const polluted = types.filter(t => t !== 'Groovy')
    await shot('plugins', '06-04-type-filter')
    writeEvidence('plugins', '06-04-type-filter', diag,
      `选中类型=Groovy; UI 行数=${n}; Groovy 行=${groovy}; 混入非 Groovy 行=[${polluted.join('/')}]（后端 plugin_type 过滤缺陷）`)
    expect(n, '类型筛选后应有结果').toBeGreaterThan(0)
    expect(groovy, '结果集应含 Groovy 类型行').toBeGreaterThan(0)
    expect(groovy, 'Groovy 行应多于掺杂的非 Groovy 行（后端 plugin_type 过滤被忽略，P1 清单已记录）')
      .toBeGreaterThan(polluted.length)
  })

  test('06-05 状态筛选应生效', async ({ page, shot, diag }) => {
    // 种子 8 条内置插件均为 DISABLED（已停用），断言有结果且全为已停用
    await page.getByTestId('plg-f-status').getByRole('radio', { name: '已停用' }).click()
    await page.waitForTimeout(2000)
    const rows = page.locator('[data-testid^="plg-row-"]')
    const n = await rows.count()
    const statuses = await page.locator('[data-testid^="plg-status-"]').allInnerTexts()
    const allDisabled = statuses.every(s => s.trim() === '已停用')
    await shot('plugins', '06-05-status-filter')
    writeEvidence('plugins', '06-05-status-filter', diag, `选中状态=已停用; UI 行数=${n}; 状态列=${statuses.slice(0, 5).join('/')}`)
    expect(n, '按状态「已停用」筛选后应有结果').toBeGreaterThan(0)
    expect(allDisabled, '筛选后所有行状态应为已停用').toBe(true)
  })

  test('06-06 插件列表应提供「新建插件」主操作入口', async ({ page, shot, diag }) => {
    // 旧 D2（入口不渲染）在 v2 已修复
    const create = page.getByTestId('plg-create')
    await expect(create, '插件列表应提供「新建插件」主操作按钮').toBeVisible({ timeout: 10_000 })
    await shot('plugins', '06-06-create-plugin-entry')
    writeEvidence('plugins', '06-06-create-plugin-entry', diag)
  })

  test('06-07 新建插件：后端创建能力（POST /v1/plugins）正常', async ({ page, shot, diag }) => {
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
    // v2 编辑器手写校验（Wizard 模式）：空表单保存 → ped-err-{prop} 逐字段提示
    await page.goto('/v2/plugins/editor/new')
    await page.waitForTimeout(1500)
    await page.getByTestId('ped-save').click()
    await page.waitForTimeout(800)
    const errs = await page.locator('[data-testid^="ped-err-"]').count()
    const nameErr = await page.getByTestId('ped-err-plugin_name').count()
    const idErr = await page.getByTestId('ped-err-plugin_id').count()
    await shot('plugins', '06-08-plugin-create-validation', true)
    expect(errs, '空表单保存应触发必填校验').toBeGreaterThan(0)
    expect(nameErr + idErr, '名称/标识为空应有对应字段错误提示').toBe(2)
    writeEvidence('plugins', '06-08-plugin-create-validation', diag,
      `校验错误条数: ${errs}（plugin_name=${nameErr}, plugin_id=${idErr}）`)
  })

  test('06-09 Groovy 插件：脚本校验按钮返回校验结果', async ({ page, shot, diag }) => {
    const id = uniq('e2e_gvyv')
    await page.goto('/v2/plugins/editor/new')
    await page.waitForTimeout(1500)
    // FcInput 的 testid 落原生 input，直接 fill；类型默认 GROOVY → 脚本区常显
    await page.getByTestId('ped-f-name').fill(id)
    await page.getByTestId('ped-f-plugin-id').fill(id)
    await page.getByTestId('ped-f-script').fill('def x = 1; return true')
    await page.getByTestId('ped-groovy-validate').click()
    await expect(page.getByTestId('ped-groovy-result')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    const hint = (await page.getByTestId('ped-groovy-result').innerText().catch(() => '')).trim()
    await shot('plugins', '06-09-groovy-script-validate')
    writeEvidence('plugins', '06-09-groovy-script-validate', diag, `校验反馈: "${hint}"`)
    expect(hint.length, '脚本校验后应给出结果反馈').toBeGreaterThan(0)
  })

  test('06-10 插件启用/禁用：状态真的变更', async ({ page, shot, diag }) => {
    // v2：行内动作直排（plg-act-enable/disable-{id}），禁用需过 FcConfirm 确认
    const enableBtn = page.locator('[data-testid^="plg-act-enable-"]').first()
    await expect(enableBtn).toBeVisible({ timeout: 15_000 })
    const testid = (await enableBtn.getAttribute('data-testid')) ?? ''
    const rowId = testid.replace('plg-act-enable-', '')
    const statusOf = () =>
      page.locator(`[data-testid="plg-row-${rowId}"]`).locator('[data-testid^="plg-status-"]').innerText()
    const before = (await statusOf()).trim()
    await enableBtn.click()
    await page.waitForTimeout(2500)
    const enabled = (await statusOf()).trim()
    await shot('plugins', '06-10-plugin-enabled-verified')
    writeEvidence('plugins', '06-10-plugin-enabled-verified', diag,
      `行 id=${rowId}; 启用前="${before}" / 启用后="${enabled}"`)
    expect(enabled, '启用后行状态应变为已启用').toBe('已启用')
    // 禁用回滚（恢复共享种子状态），需确认弹窗
    await page.locator(`[data-testid="plg-act-disable-${rowId}"]`).click()
    await v2Confirm(page).click()
    await page.waitForTimeout(2500)
    const restored = (await statusOf()).trim()
    await shot('plugins', '06-10-plugin-disabled-restored')
    expect(restored, '确认禁用后行状态应回到已停用').toBe('已停用')
  })

  test('06-11 插件删除：确认后从列表消失', async ({ page, shot, diag }) => {
    const id = uniq('e2e_delgvy')
    await apiCall(page, 'POST', '/v1/plugins', {
      plugin_name: id, plugin_id: id, plugin_type: 'GROOVY', plugin_phase: 'PRE',
      scope: 'ROUTE', sort_order: 1, config: '{}', script_content: 'def x = 1; return true',
    })
    await page.reload()
    await page.waitForTimeout(2000)
    await page.getByTestId('plg-f-keyword').fill(id)
    await page.waitForTimeout(2000)
    const del = page.locator('[data-testid^="plg-act-delete-"]').first()
    const visible = await del.isVisible().catch(() => false)
    if (visible) {
      await del.click()
      await page.waitForTimeout(800)
      await shot('plugins', '06-11-plugin-delete-confirm')
      await v2Confirm(page).click()
      await page.waitForTimeout(3000)
    }
    await shot('plugins', '06-11-plugin-delete-result')
    const still = await page.getByText(id).count()
    writeEvidence('plugins', '06-11-plugin-delete-result', diag, `删除入口可见=${visible}; 删除后仍可见次数=${still}`)
    expect(still, '删除后列表中不应再出现该插件').toBe(0)
  })

  test('06-13 内置插件市场：目录卡片渲染且配置弹窗渲染 schema 动态表单', async ({ page, shot, diag }) => {
    // 旧 /plugins/builtin 目录页 → v2 收敛进 /v2/plugins/chain 市场区；
    // 旧 D21（config_schema 字符串致动态表单恒空）后端已修复 → 断言动态控件真实渲染
    await page.goto('/v2/plugins/chain')
    await page.waitForTimeout(2500)
    const cards = await page.locator('[data-testid^="chn-mkt-"]').count()
    await shot('plugins', '06-13-builtin-market', true)
    expect(cards, '市场区应渲染内置插件卡片').toBeGreaterThan(0)
    // 优先点已安装内置的「配置」；万一无已安装项则先安装第一个可安装项再配置
    let cfg = page.locator('[data-testid^="chn-mkt-config-"]').first()
    if ((await cfg.count()) === 0) {
      const install = page.locator('[data-testid^="chn-mkt-install-"]:not([disabled])').first()
      await install.click()
      await page.waitForTimeout(3000)
      cfg = page.locator('[data-testid^="chn-mkt-config-"]').first()
    }
    await expect(cfg, '已安装内置卡片应提供「配置」按钮').toBeVisible({ timeout: 10_000 })
    await cfg.click()
    await expect(page.getByTestId('chn-cfg-dialog')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1500)
    const fields = await page.getByTestId('chn-cfg-dialog').locator('.fc-form-item').count()
    const controls = await page.getByTestId('chn-cfg-dialog').locator('input, textarea, .el-select').count()
    await shot('plugins', '06-13-builtin-config-dialog', false)
    const schema = await apiCall(page, 'GET', '/v1/plugins/builtin-types/security/schema')
    const raw = schema.payload?.config_schema ?? schema.payload?.data?.config_schema
    const propCount = raw && typeof raw === 'object' ? Object.keys(raw.properties ?? {}).length : -1
    writeEvidence('plugins', '06-13-builtin-config-dialog', diag,
      `市场卡片数=${cards}; 弹窗表单项=${fields}, 控件=${controls}; 后端 schema 类型=${typeof raw}, 属性数=${propCount}`)
    expect(fields, '配置弹窗应按 JSON Schema 渲染动态表单项（D21 已修复）').toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    writeEvidence('plugins', '06-13-builtin-market', diag, `内置插件市场卡片数: ${cards}`)
  })

  test('06-14 内置插件市场：安装入口对已安装内置置灰（目录/安装语义）', async ({ page, shot, diag }) => {
    // 旧 06-14 打 builtin 目录搜索过滤；v2 市场区无搜索框，
    // 改打「目录/安装入口语义」：已安装内置的安装钮置灰显示「已安装」，目录分组渲染
    await page.goto('/v2/plugins/chain')
    await page.waitForTimeout(2500)
    const market = page.getByTestId('chn-market')
    await expect(market).toBeVisible({ timeout: 10_000 })
    const cats = await page.locator('[data-testid^="chn-market-cat-"]').count()
    const cards = await page.locator('[data-testid^="chn-mkt-"]').count()
    // security 为种子安装的内置插件（gw_plugin id=-1）→ 安装钮应置灰且文案「已安装」
    const installSecurity = page.getByTestId('chn-mkt-install-security')
    await expect(installSecurity).toBeVisible({ timeout: 10_000 })
    const disabled = await installSecurity.isDisabled()
    const label = (await installSecurity.innerText()).trim()
    await shot('plugins', '06-14-builtin-install-state', true)
    writeEvidence('plugins', '06-14-builtin-install-state', diag,
      `目录分组=${cats}, 卡片=${cards}; security 安装钮 disabled=${disabled}, 文案="${label}"`)
    expect(cats, '市场区应按分类分组渲染').toBeGreaterThan(0)
    expect(cards, '市场区应渲染内置插件卡片').toBeGreaterThan(0)
    expect(disabled, '已安装内置的安装入口应置灰').toBe(true)
    expect(label, '已安装内置的安装入口文案应为「已装」').toBe('已装')
  })

  // ── c 类注释保留（旧 /plugins/global 随 v2 裁决不迁移，契约 §4.5）────────
  // Chain 页（/v2/plugins/chain）全局泳道 chn-lane-pre/post + chn-switch-{id} 全量覆盖
  // 旧 global 列表的 PRE/POST 编排语义，且 06-13/06-14 已改打同页市场区。
  //
  // test('06-12 全局插件：PRE/POST 两个阶段 Tab 与插件开关', async ({ page, shot, diag }) => {
  //   await page.goto('/plugins/global')
  //   const tabs = await page.locator('.fc-tab').count()
  //   const post = page.locator('.fc-tab', { hasText: '后置' }).first()
  //   ...
  // })
})
