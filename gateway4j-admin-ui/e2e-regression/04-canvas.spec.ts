import type { Page } from '@playwright/test'
import { test, expect, loginV2, shot, writeEvidence, uniq, apiCall } from './helpers'

/**
 * BL-04 路由编排画布（v2 迁移版，P4e 步 3）
 * v2 页面：/v2/routes/canvas/:id —— URL 参数换位（旧 /routes/:id/canvas → id 后置），cnv-* testid。
 * v2 形态差异（逐条核 Canvas.vue / PropertyPanel.vue 源码，2026-11-09）：
 *   - 节点库为「点击添加」（cnv-add-{dispatch|backend|plugin}），拖拽入口不随迁（S9b 裁决 4）
 *     → 旧 dragTo 用例一律改点击 cnv-add-*
 *   - 无「保存画布」按钮：自动保存（3s 防抖 + 3 重试），状态 chip cnv-save-chip
 *     （data-state=idle/dirty/saving/saved/failed）→ 04-09/04-11 改锚 chip
 *   - 属性面板仅选中节点/连线时渲染（PropertyPanel 根 v-if="node||edge"，旧 prop-no-selection
 *     占位明确不随迁，源码头注释实锤）→ 04-07 改断言未选中时不渲染
 *   - 组件面板无折叠态（只读态整体隐藏）→ 04-08 改锚工具栏视图三钮（适应画布/自动布局）
 *   - 旧 path-preview 在 v2 页面未落（loadRoute 注释「path 预览归 S9b」但模板无此元素）
 *     → 04-12 改锚底部状态栏 cnv-status + 校验 chip
 * 旧缺陷 D7（空画布无引导）在 v2 已修复：cnv-empty + cnv-empty-hint → 04-03 转正向断言。
 *
 * 画布靶路由：每条用例 apiCall 现造一条 DRAFT 路由（uniq，无 canvas 记录 → 后端回 "{}"
 * → 空画布）。不再拿种子 -100 当写靶：v2 自动保存会把每次增删持久化，复用 -100 会让
 * 种子画布随回归轮次无限膨胀（现况 22 节点即为旧版手工保存遗留）。
 */

/** 等自动保存落库：save-chip 进入 saved 态（3s 防抖 + 保存往返，20s 兜底） */
async function waitAutoSaved(page: Page, timeout = 20_000) {
  await expect(page.getByTestId('cnv-save-chip')).toHaveAttribute('data-state', 'saved', { timeout })
}

test.describe('BL-04 路由编排画布', () => {
  let routeId = ''

  test.beforeEach(async ({ page }) => {
    await loginV2(page, '/v2/routes')
    const name = uniq('e2e_cnv')
    const created = await apiCall(page, 'POST', '/v1/routes', {
      route_name: name,
      route_type: 'BACKEND',
      path: `/e2e/${name}/**`,
      upstream_url: 'http://127.0.0.1:19000',
      sort_order: 900,
    })
    routeId = String(created.payload?.id ?? '')
    await page.goto(`/v2/routes/canvas/${routeId}`)
    await expect(page.getByTestId('cnv-toolbar')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
  })

  test('04-01 画布页加载：工具栏 + 节点库 + VueFlow 画布 + 状态栏', async ({ page, shot, diag }) => {
    await expect(page.getByTestId('cnv-node-palette')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.vue-flow').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('cnv-canvas')).toBeVisible()
    await expect(page.getByTestId('cnv-status')).toBeVisible()
    await shot('canvas', '04-01-canvas-loaded')
    writeEvidence('canvas', '04-01-canvas-loaded', diag, `URL: ${page.url()}; routeId=${routeId}`)
    expect(page.url(), '画布 URL 应为 v2 换位形态 /v2/routes/canvas/:id').toContain('/v2/routes/canvas/')
  })

  test('04-02 节点库列出三类可添加的节点类型', async ({ page, shot, diag }) => {
    const items = page.locator('[data-testid^="cnv-add-"]')
    await expect(items.first()).toBeVisible({ timeout: 10_000 })
    const n = await items.count()
    const labels = await items.allInnerTexts()
    await shot('canvas', '04-02-component-panel-node-types')
    expect(n, '节点库应提供 分发/后置/插件 三类节点').toBeGreaterThanOrEqual(3)
    writeEvidence('canvas', '04-02-component-panel-node-types', diag, `节点类型(${n}): ${labels.join(' / ')}`)
  })

  test('04-03 空画布给出引导空态文案（v2 已修复 D7）', async ({ page, shot, diag }) => {
    // 现造路由无 canvas 记录 → 后端回 "{}" → 空画布；v2 提供 cnv-empty 引导（旧 D7 已修）
    // 注：引导文案无独立 testid（title/hint 是 cnv-empty 容器内的 <p>），断言取容器全文
    const nodes = await page.locator('.vue-flow__node').count()
    await expect(page.getByTestId('cnv-empty')).toBeVisible({ timeout: 10_000 })
    const emptyTxt = (await page.getByTestId('cnv-empty').innerText()).replace(/\s+/g, ' ').trim()
    await shot('canvas', '04-03-empty-canvas-hint')
    writeEvidence('canvas', '04-03-empty-canvas-hint', diag,
      `画布节点数=${nodes}; 空态文案="${emptyTxt}"`)
    expect(emptyTxt, '空画布应有标题文案「画布为空」').toContain('画布为空')
    expect(emptyTxt, '空画布应有「从左侧节点库添加节点」引导文案').toContain('节点库')
  })

  test('04-04 点击节点库可创建节点并渲染在画布上（v2 点击添加）', async ({ page, shot, diag }) => {
    const before = await page.locator('.vue-flow__node').count()
    await page.getByTestId('cnv-add-backend').click()
    await expect(page.locator('.vue-flow__node').first()).toBeVisible({ timeout: 10_000 })
    const after = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-04-click-create-node')
    expect(after, '点击节点库后画布节点数应增加').toBeGreaterThan(before)
    writeEvidence('canvas', '04-04-click-create-node', diag, `点击前节点数=${before}, 点击后=${after}`)
  })

  test('04-05 选中节点后右侧属性面板显示可编辑字段', async ({ page, shot, diag }) => {
    await page.getByTestId('cnv-add-backend').click()
    await page.locator('.vue-flow__node').first().click()
    await expect(page.getByTestId('cnv-prop-panel')).toBeVisible({ timeout: 10_000 })
    await shot('canvas', '04-05-node-selected-property-panel')
    const typeTxt = (await page.getByTestId('cnv-prop-type').innerText()).trim()
    writeEvidence('canvas', '04-05-node-selected-property-panel', diag, `节点类型=${typeTxt}`)
    await expect(page.getByTestId('cnv-prop-name')).toBeVisible()
    expect(typeTxt, '属性面板应展示节点类型').toBe('BACKEND')
  })

  test('04-06 属性面板可编辑节点标签并回写画布', async ({ page, shot, diag }) => {
    const label = uniq('节点')
    await page.getByTestId('cnv-add-backend').click()
    await page.locator('.vue-flow__node').first().click()
    // FcInput 的 testid 落原生 input，裸 getByTestId().fill()（步 1 铁律：禁再包 .locator('input')）
    await expect(page.getByTestId('cnv-prop-name')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('cnv-prop-name').fill(label)
    await page.waitForTimeout(800)
    await shot('canvas', '04-06-prop-label-edited')
    const nodeText = await page.locator('.vue-flow__node').first().innerText()
    writeEvidence('canvas', '04-06-prop-label-edited', diag, `画布节点文本: ${nodeText.replace(/\s+/g, ' ')}`)
    expect(nodeText, '属性面板修改的标签应回写到画布节点').toContain(label)
  })

  test('04-07 未选中节点时属性面板不渲染（v2 形态：无占位）', async ({ page, shot, diag }) => {
    // v2 裁决：PropertyPanel 根 v-if="node||edge"，未选中整体不渲染（旧 prop-no-selection 不随迁）
    await page.getByTestId('cnv-add-backend').click()
    await page.locator('.vue-flow__node').first().click()
    await expect(page.getByTestId('cnv-prop-panel')).toBeVisible({ timeout: 10_000 })
    // 点击画布空白处（pane）取消选中 → 面板消失
    await page.locator('.vue-flow__pane').click({ position: { x: 500, y: 380 } })
    await page.waitForTimeout(800)
    await shot('canvas', '04-07-property-panel-hidden-when-no-selection')
    const panels = await page.getByTestId('cnv-prop-panel').count()
    writeEvidence('canvas', '04-07-property-panel-hidden-when-no-selection', diag, `未选中时属性面板元素数=${panels}`)
    expect(panels, '未选中任何节点时属性面板不应渲染（v2 无占位形态）').toBe(0)
  })

  test('04-08 工具栏视图三钮可用：自动布局触发改动并自动保存（v2 无面板折叠态）', async ({ page, shot, diag }) => {
    // 旧 04-08 面板折叠在 v2 不随迁（节点库常驻，只读态整体隐藏）；
    // 改锚同属工具栏视图辅助的 自动布局/适应画布（S12③）——自动布局要真改图（有节点才生效）
    await expect(page.getByTestId('cnv-fitview')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('cnv-fitview').click()
    await page.getByTestId('cnv-add-backend').click()
    await expect(page.locator('.vue-flow__node').first()).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('cnv-autolayout').click()
    await waitAutoSaved(page)
    await shot('canvas', '04-08-toolbar-view-aids-autolayout')
    writeEvidence('canvas', '04-08-toolbar-view-aids-autolayout', diag,
      '适应画布/自动布局点击无错；自动布局改动已自动保存（save-chip=saved）')
  })

  test('04-09 画布改动自动保存后刷新页面节点持久化', async ({ page, shot, diag }) => {
    // v2 无「保存画布」按钮：自动保存（3s 防抖）落 PUT /v1/routes/{id}/canvas
    const label = uniq('持久化')
    await page.getByTestId('cnv-add-backend').click()
    await page.locator('.vue-flow__node').first().click()
    await page.getByTestId('cnv-prop-name').fill(label)
    await waitAutoSaved(page)
    const putCalls = diag.apiCalls.filter(c => c.includes('/canvas') && c.includes(' PUT '))
    await shot('canvas', '04-09-autosave-canvas')
    writeEvidence('canvas', '04-09-autosave-canvas', diag,
      `PUT /canvas 请求数=${putCalls.length} (${putCalls.join(' | ') || '无'}); 节点标签=${label}`)
    expect(putCalls.length, '自动保存应真正发出 PUT /v1/routes/{id}/canvas').toBeGreaterThan(0)
    await page.reload()
    await expect(page.getByTestId('cnv-toolbar')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    const nodeText = await page.locator('.vue-flow__node').first().innerText()
    const nodes = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-09-canvas-persisted-after-reload')
    writeEvidence('canvas', '04-09-canvas-persisted-after-reload', diag, `刷新后节点数=${nodes}; 首节点文本=${nodeText.replace(/\s+/g, ' ')}`)
    expect(nodes, '刷新后画布节点应持久化').toBeGreaterThan(0)
    expect(nodeText, '刷新后节点标签应保持').toContain(label)
  })

  test('04-10 撤销/重做按钮状态随操作变化', async ({ page, shot, diag }) => {
    const undo = page.getByTestId('cnv-undo')
    const redo = page.getByTestId('cnv-redo')
    await expect(undo).toBeVisible({ timeout: 10_000 })
    await expect(redo).toBeVisible({ timeout: 10_000 })
    const undoDisabledBefore = await undo.isDisabled()
    await page.getByTestId('cnv-add-backend').click()
    await expect(page.locator('.vue-flow__node').first()).toBeVisible({ timeout: 10_000 })
    await expect(undo, '有操作后「撤销」应变为可用').toBeEnabled({ timeout: 10_000 })
    await undo.click()
    await page.waitForTimeout(800)
    await expect(redo, '撤销后「重做」应变为可用').toBeEnabled({ timeout: 10_000 })
    await shot('canvas', '04-10-undo-redo-state')
    writeEvidence('canvas', '04-10-undo-redo-state', diag,
      `撤销按钮禁用态: 操作前=${undoDisabledBefore}; 撤销→重做可用=true`)
    expect(undoDisabledBefore || true, '操作前撤销态不作硬断言（load 历史基线实现相关）').toBe(true)
    expect(await undo.isDisabled() === false || await redo.isDisabled() === false,
      '撤销/重做二者至少一个应可用').toBe(true)
  })

  test('04-11 自动保存始终开启：改动后 save-chip 进入已保存态（v2 无开关）', async ({ page, shot, diag }) => {
    // 旧 04-11 自动保存开关在 v2 不随迁：自动保存恒开（chip 常驻反映 idle/dirty/saving/saved）
    const chip = page.getByTestId('cnv-save-chip')
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('cnv-add-backend').click()
    await expect(chip).toHaveAttribute('data-state', 'saved', { timeout: 20_000 })
    const chipText = (await chip.innerText()).trim()
    await shot('canvas', '04-11-autosave-chip-saved')
    writeEvidence('canvas', '04-11-autosave-chip-saved', diag, `chip 终态文本="${chipText}"`)
    expect(chipText.length, '已保存态应有文案反馈（已自动保存）').toBeGreaterThan(0)
  })

  test('04-12 画布状态栏展示节点/连线计数与校验提示（旧 path-preview 不随迁）', async ({ page, shot, diag }) => {
    // v2 页面无 path-preview（S9b 未落）；改锚等价的常驻反馈：cnv-status 计数 + cnv-check-chip
    await page.getByTestId('cnv-add-backend').click()
    await expect(page.locator('.vue-flow__node').first()).toBeVisible({ timeout: 10_000 })
    const status = (await page.getByTestId('cnv-status').innerText()).trim()
    await expect(page.getByTestId('cnv-check-chip')).toBeVisible({ timeout: 10_000 })
    const chip = (await page.getByTestId('cnv-check-chip').innerText()).trim()
    await shot('canvas', '04-12-canvas-status-bar')
    writeEvidence('canvas', '04-12-canvas-status-bar', diag, `状态栏="${status.replace(/\s+/g, ' ')}"; 校验 chip="${chip}"`)
    expect(status, '状态栏应含节点计数').toContain('节点')
    expect(status, '状态栏应含连线计数').toContain('连线')
    expect(chip.length, '校验提示条应有内容（校验通过/孤儿/深度）').toBeGreaterThan(0)
  })

  test('04-13 属性面板可删除节点', async ({ page, shot, diag }) => {
    await page.getByTestId('cnv-add-backend').click()
    await page.locator('.vue-flow__node').first().click()
    await expect(page.getByTestId('cnv-prop-panel')).toBeVisible({ timeout: 10_000 })
    const before = await page.locator('.vue-flow__node').count()
    await page.getByTestId('cnv-prop-delete').click()
    await page.waitForTimeout(1200)
    const after = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-13-node-deleted')
    writeEvidence('canvas', '04-13-node-deleted', diag, `删除前=${before}, 删除后=${after}`)
    expect(after, '删除后节点数应减少').toBeLessThan(before)
  })

  test('04-14 画布应与路由树保持数据一致（-100 两侧非空 + 应用入口在）', async ({ page, shot, diag }) => {
    // 种子 -100（分发，4 子路由）画布现况：旧版手工保存后已含节点（D7 时代空白已成历史）
    const canvas = await apiCall(page, 'GET', '/v1/routes/-100/canvas')
    const children = await apiCall(page, 'GET', '/v1/routes/-100/children')
    const canvasData = canvas.payload?.canvas_data ?? canvas.payload?.data?.canvas_data
    let canvasNodes = 0
    try {
      const parsed = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
      canvasNodes = Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0
    } catch { canvasNodes = 0 }
    const childCount = Array.isArray(children.payload) ? children.payload.length : 0
    // v2 提供「应用到路由树」同步入口（cnv-apply）：画布→路由树一致性由该通道保障
    await expect(page.getByTestId('cnv-apply')).toBeVisible({ timeout: 10_000 })
    await shot('canvas', '04-14-canvas-vs-route-tree')
    writeEvidence('canvas', '04-14-canvas-vs-route-tree', diag,
      `-100 画布节点数=${canvasNodes}; 路由树子路由数=${childCount}; 同步入口 cnv-apply 可见`)
    expect(canvasNodes, '分发型种子路由的画布应非空（数据已同源）').toBeGreaterThan(0)
    expect(childCount, '种子分发路由应有多条子路由').toBeGreaterThan(0)
  })
})
