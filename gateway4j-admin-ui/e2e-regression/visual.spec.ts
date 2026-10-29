import { test, expect, login } from './helpers'
import type { Page } from '@playwright/test'

/**
 * 视觉回归基线套件（opt-in，默认全 skip）。
 *
 * 为什么默认 skip：截图比对对字体渲染/亚像素抗锯齿极其敏感，
 * CI runner（无本地字体）与本机渲染必然存在差异，无脑进 nightly 只会爆基线。
 * 因此本套件只在 GW_VISUAL=1 时运行：
 *
 *   # 生成基线 / 日常比对（基线位于 e2e-regression/visual.spec-snapshots/，
 *   # 文件带 -chromium-<platform> 后缀，平台间互不干扰）
 *   GW_VISUAL=1 npx playwright test --config=playwright.regression.config.ts \
 *     --reporter=list visual.spec.ts
 *
 *   # UI 有意改版后更新基线：加 --update-snapshots 重跑同命令
 *
 * 何时比对：改任何模板/样式/主题/组件库升级之后，本地跑一轮看 diff。
 * 详细说明见 docs/VISUAL_REGRESSION.md。
 *
 * 关键态选取（8 个）：登录页、监控大盘（light+dark）、路由列表、编排画布、
 * 内置插件卡片、系统设置（dark）。dark 态通过注入 fc-theme-provider 的
 * localStorage 持久化实现（FcThemeProvider setup 时同步恢复，无首屏闪烁）。
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
    // 用 mask 抠掉动态区 + 2% 像素容差兜底，其余关键态仍走逐像素严格比对
    mask: opts.mask,
    maxDiffPixelRatio: opts.maxDiffPixelRatio,
  })
}

/** 大盘动态区：默认落在指标 Tab —— 统计/指标卡数值、趋势图（ECharts 活数据）、
 *  最近刷新时间、路由选择器（共享演示库里并行测试会增删路由，选中项文案会变） */
function dashboardDynamicAreas(page: Page) {
  return [
    page.locator('.stat-value'),
    page.locator('.metric-value'),
    page.locator('.last-refresh'),
    page.locator('.trend-chart'),
    page.locator('.metrics-toolbar .el-select'),
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
    await login(page, '/routes')
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    // 表体行数据随共享演示库变化（并行测试会增删路由）→ mask 表体，
    // 门禁保留：侧栏 / 工具栏 / 搜索 / 表头 / 分页 / 整体版式与主题
    await stableShot(page, 'routes-list-light.png', {
      mask: [page.locator('.el-table__body-wrapper')],
      maxDiffPixelRatio: 0.01,
    })
  })

  test('dashboard · 监控大盘', async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/dashboard')
    await expect(page.locator('.stat-grid').first()).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'dashboard-light.png', { mask: dashboardDynamicAreas(page), maxDiffPixelRatio: 0.02 })
  })

  test('route-canvas · 编排画布', async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/routes/-100/canvas')
    await expect(page.locator('.vue-flow').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid="component-panel"]')).toBeVisible({ timeout: 10_000 })
    // Vue Flow 首帧布局/连线渲染有 JS 动画，多等一拍
    await page.waitForTimeout(1500)
    await stableShot(page, 'route-canvas-light.png')
  })

  test('builtin-plugins · 内置插件卡片', async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/plugins/builtin')
    // 内置插件页是分类卡片（FcSectionCard.type-card），不是表格
    await expect(page.locator('.type-card').first()).toBeVisible({ timeout: 20_000 })
    // runtime-stats 是插件实时计数器（QPS 等），逐次运行必变 → mask
    await stableShot(page, 'builtin-plugins-light.png', {
      mask: [page.locator('.runtime-stats')],
      maxDiffPixelRatio: 0.01,
    })
  })

  test('settings · 系统设置', async ({ page }) => {
    await login(page, '/routes')
    await page.goto('/settings')
    await expect(
      page.locator('.el-form-item').filter({ has: page.locator('label', { hasText: '站点名称' }) }),
    ).toBeVisible({ timeout: 15_000 })
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
    await login(page, '/routes')
    await page.goto('/dashboard')
    await expect(page.locator('.stat-grid').first()).toBeVisible({ timeout: 20_000 })
    await stableShot(page, 'dashboard-dark.png', { mask: dashboardDynamicAreas(page), maxDiffPixelRatio: 0.02 })
  })
})
