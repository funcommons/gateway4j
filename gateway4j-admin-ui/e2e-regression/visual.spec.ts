import { test, expect, loginV2 } from './helpers'
import type { Page } from '@playwright/test'

/**
 * 视觉回归基线套件（opt-in，默认全 skip）。
 *
 * 为什么默认 skip：截图比对对字体渲染/亚像素抗锯齿极其敏感，
 * CI runner（无本地字体）与本机渲染必然存在差异，无脑进 nightly 只会爆基线。
 * 因此本套件只在 GW_VISUAL=1 时运行：
 *
 *   # 生成基线 / 日常比对（基线位于 e2e-regression/visual.spec.ts-snapshots/，
 *   # 文件带 -chromium-<platform> 后缀，平台间互不干扰）
 *   GW_VISUAL=1 npx playwright test --config=playwright.regression.config.ts \
 *     --reporter=list visual.spec.ts
 *
 *   # UI 有意改版后更新基线：加 --update-snapshots 重跑同命令
 *
 * 何时比对：改任何模板/样式/主题/组件库升级之后，本地跑一轮看 diff。
 * 详细说明见 docs/VISUAL_REGRESSION.md。
 *
 * 关键态选取（8 个，P4e 步 5 随全量迁移打到 v2 —— 旧基线已全作废重制）：
 * 登录页（共享页，v1=v2 同一组件）、路由列表 /v2/routes、监控大盘 /v2/monitor（light+dark）、
 * 编排画布 /v2/routes/canvas/:id、插件市场 /v2/plugins/chain（旧 builtin 卡片区在 v2 并入
 * 链路页市场区）、系统设置 /v2/settings（dark 态只保留大盘一张，与旧套件同口径）。
 * dark 态通过注入 fc-theme-provider 的 localStorage 持久化实现
 * （FcThemeProvider setup 时同步恢复，无首屏闪烁；v2 壳 .v2-shell 底色随之切换）。
 *
 * 注意：--reporter=list 是刻意的 —— CLI 传 reporter 会整体覆盖 config 的
 * reporters，避免把只有 8 条视觉用例的结果写进 test-report 下的 results.json
 * 而覆盖全量回归结果。
 */

// 非本机非 chromium 跑不出可比对基线；当前基线只在本地 macOS chromium 维护
test.skip((process.env.GW_VISUAL ?? '') !== '1', '视觉回归默认关闭：GW_VISUAL=1 时启用（防 nightly 在 CI 字体渲染差异下爆基线）')

test.use({ locale: 'zh-CN' })

/** FcThemeProvider 的 localStorage 持久化（见 src/components/theme/FcThemeProvider.vue） */
const THEME_PERSIST_KEY = 'fc-theme-provider'

/** 在 app 首个脚本执行前预置主题（setup 时同步恢复 data-theme，无闪烁） */
function presetTheme(page: Page, theme: 'light' | 'dark') {
  return page.addInitScript(
    ({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state))
    },
    { key: THEME_PERSIST_KEY, state: { v: 1, brand: 'ldx2', theme } },
  )
}

/** 网络静默 + 动画落定后再截图（数据/骨架屏/过渡都等完） */
async function stableShot(
  page: Page,
  name: string,
  opts: { mask?: ReturnType<Page['locator']>[]; maxDiffPixelRatio?: number } = {},
) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    // 大盘等页面存在真实业务数值（请求数/最近刷新时间），逐次运行会变 ——
    // 用 mask 抠掉动态区 + 容差兜底，其余关键态仍走逐像素严格比对
    mask: opts.mask,
    maxDiffPixelRatio: opts.maxDiffPixelRatio,
  })
}

/** v2 监控大盘动态区：KPI 六值、实时流徽标/状态、最近刷新、慢路由 Top5 行、
 *  donut 中心总数与桶值、两张手绘 SVG 时序图、上游健康毫秒数（均为活数据） */
function monitorDynamicAreas(page: Page) {
  return [
    page.locator('.kpi-v'),
    page.locator('.mon-badge-val'),
    page.locator('.mon-stream-state'),
    page.locator('[data-testid="mon-last-refresh"]'),
    page.locator('[data-testid="mon-slow-card"] .slow-name'),
    page.locator('[data-testid="mon-slow-card"] .slow-val'),
    page.locator('[data-testid="mon-slow-card"] .slow-bar-fill'),
    page.locator('[data-testid="mon-ring-total"]'),
    page.locator('.bucket-val'),
    page.locator('.bucket-pct'),
    page.locator('.ts-chart'),
    page.locator('.up-ms'),
  ]
}

test.describe('视觉基线 · light', () => {
  test.beforeEach(async ({ page }) => {
    await presetTheme(page, 'light')
  })

  test('login-page · 登录页', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'login-page-light.png')
  })

  test('routes-list · 路由列表', async ({ page }) => {
    await loginV2(page, '/v2/routes')
    // v2 语义表 .rt-table（原生 table）：表体行数据随共享演示库变化（并行测试会增删路由）→ mask 表体，
    // 门禁保留：侧栏 / 工具栏 / 搜索 / 表头 / 汇总条 / 整体版式与主题
    await expect(page.locator('[data-testid^="route-row-"]').first()).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'routes-list-light.png', {
      mask: [page.locator('.rt-table tbody')],
      maxDiffPixelRatio: 0.01,
    })
  })

  test('dashboard · 监控大盘', async ({ page }) => {
    await loginV2(page, '/v2/monitor')
    await expect(page.getByTestId('mon-kpi-hits')).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'dashboard-light.png', { mask: monitorDynamicAreas(page), maxDiffPixelRatio: 0.02 })
  })

  test('route-canvas · 编排画布', async ({ page }) => {
    await loginV2(page, '/v2/routes')
    await page.goto('/v2/routes/canvas/-100')
    await expect(page.locator('.vue-flow').first()).toBeVisible({ timeout: 20_000 })
    // v2 节点库（点击添加，非旧 drag 组件面板）
    await expect(page.getByTestId('cnv-node-palette')).toBeVisible({ timeout: 10_000 })
    // Vue Flow 首帧布局/连线渲染有 JS 动画，多等一拍
    await page.waitForTimeout(1500)
    // 状态条含节点/边计数与自动保存 chip（3s 防抖可能恰好落"保存中"）→ mask
    await stableShot(page, 'route-canvas-light.png', { mask: [page.getByTestId('cnv-status')] })
  })

  test('builtin-plugins · 插件市场（原内置插件卡片）', async ({ page }) => {
    await loginV2(page, '/v2/plugins')
    await page.goto('/v2/plugins/chain')
    // v2 把旧 builtin 分类卡片区并入链路页市场区 chn-market（含链路泳道卡）
    await expect(page.getByTestId('chn-market')).toBeVisible({ timeout: 20_000 })
    // chn-runtime / chn-stats 是插件实时计数器（QPS 等），逐次运行必变 → mask
    await stableShot(page, 'builtin-plugins-light.png', {
      mask: [
        page.locator('[data-testid^="chn-runtime-"]'),
        page.locator('[data-testid^="chn-stats-"]'),
      ],
      maxDiffPixelRatio: 0.01,
    })
  })

  test('settings · 系统设置', async ({ page }) => {
    await loginV2(page, '/v2/settings')
    // v2 设置页默认落 general 分区（站点名称 FcInput 为首个稳定锚点）
    await expect(page.getByTestId('set-input-site_name')).toBeVisible({ timeout: 15_000 })
    await stableShot(page, 'settings-light.png')
  })
})

test.describe('视觉基线 · dark', () => {
  test.beforeEach(async ({ page }) => {
    await presetTheme(page, 'dark')
  })

  test('login-page · 登录页（dark）', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'login-page-dark.png')
  })

  test('dashboard · 监控大盘（dark）', async ({ page }) => {
    await loginV2(page, '/v2/monitor')
    await expect(page.getByTestId('mon-kpi-hits')).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'dashboard-dark.png', { mask: monitorDynamicAreas(page), maxDiffPixelRatio: 0.02 })
  })
})
