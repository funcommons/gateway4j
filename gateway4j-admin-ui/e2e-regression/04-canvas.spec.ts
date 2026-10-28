import { test, expect, login, shot, writeEvidence, apiCall } from './helpers'

/**
 * BL-04 路由编排画布（Vue Flow 可视化编排）
 * 覆盖：画布加载、组件面板、拖拽建节点、属性面板编辑、撤销/重做、
 *       保存与持久化、自动保存、路径预览、面板折叠、删除节点。
 *
 * 已知缺陷：
 *   D7  画布数据与路由树不同源：后端对没有画布记录的路由返回 canvasData="{}"，
 *       画布不会由路由树自动生成；空画布也没有任何引导文案。
 */
test.describe('BL-04 路由编排画布', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1000)
    await page.goto('/routes/-100/canvas')
    await page.waitForTimeout(3000)
  })

  test('04-01 画布页加载：工具栏 + 组件面板 + 属性面板 + VueFlow 画布', async ({ page, shot, diag }) => {
    await expect(page.locator('.canvas-toolbar').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid="component-panel"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="property-panel"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.vue-flow').first()).toBeVisible({ timeout: 15_000 })
    await shot('canvas', '04-01-canvas-loaded')
    writeEvidence('canvas', '04-01-canvas-loaded', diag, `URL: ${page.url()}`)
  })

  test('04-02 组件面板列出可拖拽的节点类型', async ({ page, shot, diag }) => {
    const items = page.locator('[data-testid="node-type-item"]')
    await expect(items.first()).toBeVisible({ timeout: 10_000 })
    const n = await items.count()
    const labels = await items.allInnerTexts()
    await shot('canvas', '04-02-component-panel-node-types')
    expect(n, '组件面板应至少提供 1 种可拖拽节点类型').toBeGreaterThan(0)
    writeEvidence('canvas', '04-02-component-panel-node-types', diag, `节点类型: ${labels.join(' / ')}`)
  })

  test('04-03 空画布应给出引导空态文案', async ({ page, shot, diag }) => {
    // D7: 路由 -100 有 4 条子路由，但画布数据是 {}，画布完全空白且没有任何提示
    const nodes = await page.locator('.vue-flow__node').count()
    const shellText = await page.locator('.canvas-shell').innerText().catch(() => '')
    await shot('canvas', '04-03-empty-canvas-no-hint', true)
    writeEvidence('canvas', '04-03-empty-canvas-no-hint', diag,
      `画布节点数=${nodes}; .canvas-shell 文本="${shellText.trim().slice(0, 120)}"`)
    expect(shellText.trim().length, '空画布应给出「拖拽节点到画布」之类的引导文案（当前完全空白）').toBeGreaterThan(0)
  })

  test('04-04 从组件面板拖拽可创建节点并渲染在画布上', async ({ page, shot, diag }) => {
    const before = await page.locator('.vue-flow__node').count()
    await page.locator('[data-testid="node-type-item"]').first().dragTo(page.locator('.canvas-shell'))
    await page.waitForTimeout(1500)
    const after = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-04-drag-create-node')
    expect(after, '拖拽后节点数应增加').toBeGreaterThan(before)
    writeEvidence('canvas', '04-04-drag-create-node', diag, `拖拽前节点数=${before}, 拖拽后=${after}`)
  })

  test('04-05 选中节点后右侧属性面板显示可编辑字段', async ({ page, shot, diag }) => {
    const node = page.locator('.vue-flow__node').first()
    if ((await node.count()) === 0) {
      await page.locator('[data-testid="node-type-item"]').first().dragTo(page.locator('.canvas-shell'))
      await page.waitForTimeout(1200)
    }
    await page.locator('.vue-flow__node').first().click()
    await page.waitForTimeout(1000)
    const panel = page.locator('[data-testid="prop-panel-content"]')
    const visible = await panel.isVisible().catch(() => false)
    await shot('canvas', '04-05-node-selected-property-panel')
    expect(visible, '选中节点后应展示属性面板内容').toBe(true)
    writeEvidence('canvas', '04-05-node-selected-property-panel', diag)
  })

  test('04-06 属性面板可编辑节点标签并回写画布', async ({ page, shot, diag }) => {
    await page.locator('[data-testid="node-type-item"]').first().dragTo(page.locator('.canvas-shell'))
    await page.waitForTimeout(1200)
    await page.locator('.vue-flow__node').first().click()
    await page.waitForTimeout(900)
    const label = page.locator('input[data-testid="prop-label"]')
    await expect(label).toBeVisible({ timeout: 10_000 })
    await label.fill('回归测试节点')
    await page.waitForTimeout(800)
    await shot('canvas', '04-06-prop-label-edited')
    const nodeText = await page.locator('.vue-flow__node').first().innerText()
    writeEvidence('canvas', '04-06-prop-label-edited', diag, `画布节点文本: ${nodeText.replace(/\s+/g, ' ')}`)
    expect(nodeText, '属性面板修改的标签应回写到画布节点').toContain('回归测试节点')
  })

  test('04-07 未选中时属性面板显示空态提示', async ({ page, shot, diag }) => {
    await page.locator('.canvas-shell').click({ position: { x: 30, y: 30 } })
    await page.waitForTimeout(800)
    const empty = page.locator('[data-testid="prop-no-selection"]')
    await expect(empty).toBeVisible({ timeout: 10_000 })
    await shot('canvas', '04-07-property-panel-empty')
    writeEvidence('canvas', '04-07-property-panel-empty', diag)
  })

  test('04-08 组件面板可折叠/展开', async ({ page, shot, diag }) => {
    const toggle = page.locator('[data-testid="panel-toggle"]')
    await toggle.click()
    await page.waitForTimeout(600)
    const collapsed = await page.locator('[data-testid="component-panel"].collapsed').count()
    await shot('canvas', '04-08-panel-collapsed')
    expect(collapsed, '点击折叠按钮后组件面板应带 collapsed 态').toBe(1)
    await toggle.click()
    await page.waitForTimeout(600)
    await shot('canvas', '04-08-panel-expanded-again')
    writeEvidence('canvas', '04-08-panel-collapsed', diag)
  })

  test('04-09 保存画布后刷新页面节点持久化', async ({ page, shot, diag }) => {
    // 用「后置路由」节点：分发路由节点受业务规则约束（必须至少有一条连线）
    await page.locator('[data-testid="node-type-item"]').nth(1).dragTo(page.locator('.canvas-shell'))
    await page.waitForTimeout(1200)
    await page.locator('.vue-flow__node').first().click()
    await page.waitForTimeout(700)
    await page.locator('input[data-testid="prop-label"]').fill('持久化验证节点')
    await page.waitForTimeout(600)
    const save = page.getByRole('button', { name: '保存画布' })
    await expect(save).toBeVisible({ timeout: 10_000 })
    await save.click()
    await page.waitForTimeout(2500)
    await shot('canvas', '04-09-save-canvas')
    // 注：画布把 loadError 与 saveError 共用同一个 data-testid="save-error"，
    //     D3（GET /v1/routes/{id} 405）会让该元素常驻，因此这里以实际 API 状态判定保存是否成功
    const putCall = diag.apiCalls.filter(c => c.includes('/canvas') && c.startsWith('200')).length
    expect(putCall, '保存画布应成功（PUT /v1/routes/{id}/canvas 返回 2xx）').toBeGreaterThan(0)
    await page.reload()
    await page.waitForTimeout(3000)
    const nodes = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-09-canvas-persisted-after-reload')
    writeEvidence('canvas', '04-09-canvas-persisted-after-reload', diag, `刷新后节点数=${nodes}`)
    expect(nodes, '刷新后画布节点应持久化').toBeGreaterThan(0)
  })

  test('04-10 撤销/重做按钮状态随操作变化', async ({ page, shot, diag }) => {
    const undo = page.getByRole('button', { name: '撤销' })
    const redo = page.getByRole('button', { name: '重做' })
    await expect(undo).toBeVisible({ timeout: 10_000 })
    await expect(redo).toBeVisible({ timeout: 10_000 })
    const undoDisabledBefore = await undo.isDisabled()
    await page.locator('[data-testid="node-type-item"]').first().dragTo(page.locator('.canvas-shell'))
    await page.waitForTimeout(1500)
    const undoDisabledAfter = await undo.isDisabled()
    await shot('canvas', '04-10-undo-redo-state')
    writeEvidence('canvas', '04-10-undo-redo-state', diag,
      `撤销按钮禁用态: 操作前=${undoDisabledBefore}, 操作后=${undoDisabledAfter}`)
    expect(undoDisabledAfter, '有操作后「撤销」按钮应变为可用').toBe(false)
  })

  test('04-11 自动保存开关可用', async ({ page, shot, diag }) => {
    const sw = page.locator('.canvas-toolbar .fc-switch, .canvas-toolbar .el-switch').first()
    const visible = await sw.isVisible().catch(() => false)
    if (visible) {
      await sw.click()
      await page.waitForTimeout(1000)
    }
    await shot('canvas', '04-11-autosave-toggle')
    expect(visible, '画布工具栏应提供自动保存开关').toBe(true)
    writeEvidence('canvas', '04-11-autosave-toggle', diag)
  })

  test('04-12 路径预览区展示当前路由路径', async ({ page, shot, diag }) => {
    const preview = page.locator('[data-testid="path-preview"]')
    await expect(preview).toBeVisible({ timeout: 10_000 })
    const txt = (await preview.innerText()).trim()
    await shot('canvas', '04-12-path-preview')
    expect(txt.length, '路径预览应有内容').toBeGreaterThan(0)
    writeEvidence('canvas', '04-12-path-preview', diag, `路径预览文案: ${txt}`)
  })

  test('04-13 属性面板可删除节点', async ({ page, shot, diag }) => {
    await page.locator('[data-testid="node-type-item"]').first().dragTo(page.locator('.canvas-shell'))
    await page.waitForTimeout(1200)
    await page.locator('.vue-flow__node').first().click()
    await page.waitForTimeout(900)
    const before = await page.locator('.vue-flow__node').count()
    await page.locator('[data-testid="prop-panel-content"]').getByRole('button', { name: '删除' }).click()
    await page.waitForTimeout(1200)
    const after = await page.locator('.vue-flow__node').count()
    await shot('canvas', '04-13-node-deleted')
    writeEvidence('canvas', '04-13-node-deleted', diag, `删除前=${before}, 删除后=${after}`)
    expect(after, '删除后节点数应减少').toBeLessThan(before)
  })

  test('04-14 画布应与路由树保持数据一致', async ({ page, shot, diag }) => {
    // D7: 分发路由 -100 在列表里有子路由，但画布数据为 {}，两侧数据不同源
    const canvas = await apiCall(page, 'GET', '/v1/routes/-100/canvas')
    const tree = await apiCall(page, 'GET', '/v1/routes')
    const children = await apiCall(page, 'GET', '/v1/routes/-100/children')
    const canvasData = canvas.payload?.canvas_data ?? canvas.payload?.data?.canvas_data
    await shot('canvas', '04-14-canvas-vs-route-tree', true)
    writeEvidence('canvas', '04-14-canvas-vs-route-tree', diag,
      `canvas_data=${JSON.stringify(canvasData)?.slice(0, 200)}; 子路由数=${Array.isArray(children.payload) ? children.payload.length : JSON.stringify(children.payload).slice(0, 120)}`)
    const childCount = Array.isArray(children.payload) ? children.payload.length : 0
    const nodeCount = await page.locator('.vue-flow__node').count()
    expect(childCount === 0 || nodeCount > 0, '有子路由时分发型路由的画布应能反映路由树（或提供一键同步入口）').toBe(true)
  })
})
