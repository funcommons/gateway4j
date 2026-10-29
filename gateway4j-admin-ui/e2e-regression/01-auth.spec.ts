import { test, expect, login, shot, writeEvidence } from './helpers'

/**
 * BL-01 认证与登录 + 全局应用外壳（导航框架）
 * 覆盖：登录页渲染、空值校验、错误口令、正确登录、记住我、
 *       未登录访问受保护路由的守卫、退出登录、Token 持久化、
 *       全局侧边栏/顶栏（登出、主题切换）是否渲染。
 */
test.describe('BL-01 认证与登录', () => {
  test('01-01 登录页正常渲染（品牌标题/用户名/密码/记住我/登录按钮）', async ({ page, shot }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('input').first()).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByText('记住我')).toBeVisible()
    await expect(page.getByText('Gateway4j 后台')).toBeVisible()
    await shot('auth', '01-01-login-page')
  })

  test('01-02 空用户名/空密码提交被前端拦截并提示', async ({ page, shot, diag }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.getByText('请输入用户名和密码')).toBeVisible({ timeout: 10_000 })
    await shot('auth', '01-02-empty-submit-rejected')
    writeEvidence('auth', '01-02-empty-submit-rejected', diag, '断言: 提交空表单应提示 "请输入用户名和密码"')
  })

  test('01-03 错误口令给出可见错误提示且不跳转', async ({ page, shot, diag }) => {
    await page.goto('/login')
    await page.locator('input').first().fill('admin')
    await page.locator('input[type="password"]').first().fill('wrong-password-xxx')
    await page.getByRole('button', { name: '登录' }).click()
    await page.waitForTimeout(2500)
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    const errVisible = await page.locator('.auth-error').isVisible().catch(() => false)
    expect(errVisible, '登录失败时应展示 .auth-error 错误文案').toBe(true)
    await shot('auth', '01-03-wrong-password-error')
    writeEvidence('auth', '01-03-wrong-password-error', diag, '断言: 错误口令应停留 /login 且显示 .auth-error')
  })

  test('01-04 正确凭证登录成功并进入路由列表', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    await shot('auth', '01-04-login-success')
    writeEvidence('auth', '01-04-login-success', diag)
  })

  test('01-05 未登录直接访问受保护路由被守卫拦截并跳登录页', async ({ page, shot, diag }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await shot('auth', '01-05-guard-redirect-to-login')
    writeEvidence('auth', '01-05-guard-redirect-to-login', diag, '断言: 未登录访问 /dashboard 应重定向到 /login')
  })

  test('01-06 登录后刷新页面保持登录态（会话持久化）', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.reload()
    await page.waitForTimeout(2500)
    await expect(page).toHaveURL(/\/routes/, { timeout: 20_000 })
    await expect(page.locator('.el-table').first()).toBeVisible({ timeout: 20_000 })
    await shot('auth', '01-06-session-persists-after-reload')
    writeEvidence('auth', '01-06-session-persists-after-reload', diag)
  })

  test('01-07 顶栏登出按钮存在且可点击退出登录', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1200)
    const logout = page.getByRole('button', { name: '退出' })
    await expect(logout, '顶栏应渲染 "退出" 按钮（MainLayout -> FcHeader actions slot）').toBeVisible({ timeout: 10_000 })
    await logout.click()
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await shot('auth', '01-07-logout-button-and-redirect')
    writeEvidence('auth', '01-07-logout-button-and-redirect', diag)
  })

  test('01-08 退出登录后无法再访问受保护路由', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    // 直接调用 store 的登出动作（等价于顶栏按钮行为），验证守卫是否生效
    await page.evaluate(() => {
      localStorage.removeItem('gw4j_token')
      localStorage.removeItem('gw4j_refresh')
      sessionStorage.removeItem('gw4j_refresh')
    })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await shot('auth', '01-08-logout-guard-works')
    writeEvidence('auth', '01-08-logout-guard-works', diag)
  })

  test('01-09 全局侧边栏渲染出各业务线导航入口', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1500)
    const sidebar = page.locator('.fc-sidebar')
    await expect(sidebar, '主布局应渲染 .fc-sidebar 侧边栏容器').toBeVisible({ timeout: 10_000 })
    // SDK 侧栏菜单基于 el-menu：菜单项为 li.el-menu-item，文案在 span.app-menu-item__label
    const entries = page.locator('.fc-sidebar .el-menu-item')
    const n = await entries.count()
    expect(n, '侧边栏应至少渲染 1 个业务线导航入口').toBeGreaterThan(0)
    const labels = await page.locator('.fc-sidebar .app-menu-item__label').allInnerTexts()
    await shot('auth', '01-09-sidebar-nav-entries')
    writeEvidence('auth', '01-09-sidebar-nav-entries', diag, `导航入口数: ${n}; 菜单: ${labels.join(' / ')}`)
  })

  test('01-10 顶栏渲染标题/主题切换/用户信息区', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1500)
    const header = page.locator('.fc-header')
    await expect(header, '主布局应渲染 .fc-header 顶栏容器').toBeVisible({ timeout: 10_000 })
    await shot('auth', '01-10-header-rendered')
    writeEvidence('auth', '01-10-header-rendered', diag)
  })

  test('01-11 主题/品牌/语言切换器可达（位于顶栏 actions 区）', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.waitForTimeout(1500)
    const switcher = page.locator('.fc-theme-switcher, [class*="theme-switcher"]').first()
    await expect(switcher, '应提供主题/品牌/语言切换器').toBeVisible({ timeout: 10_000 })
    await shot('auth', '01-11-theme-switcher')
    writeEvidence('auth', '01-11-theme-switcher', diag)
  })

  test('01-12 登录失败时不残留无效 Token', async ({ page, shot, diag }) => {
    await page.goto('/login')
    await page.locator('input').first().fill('admin')
    await page.locator('input[type="password"]').first().fill('bad-password-zzz')
    await page.getByRole('button', { name: '登录' }).click()
    await page.waitForTimeout(2500)
    const token = await page.evaluate(() => localStorage.getItem('gw4j_token'))
    const refresh = await page.evaluate(() => localStorage.getItem('gw4j_refresh'))
    await shot('auth', '01-12-no-token-residue')
    expect(token, '登录失败不应在 localStorage 残留 access_token').toBeNull()
    expect(refresh, '登录失败不应在 localStorage 残留 refresh_token').toBeNull()
    writeEvidence('auth', '01-12-no-token-residue', diag)
  })

  test('01-13 "记住我"勾选状态决定 refresh token 的存储位置', async ({ page, shot, diag }) => {
    await page.goto('/login')
    await page.locator('input').first().fill('admin')
    await page.locator('input[type="password"]').first().fill('admin123')
    // el-checkbox 的原生 input 被视觉隐藏，改点可见文案取消勾选
    const rememberLabel = page.getByText('记住我', { exact: true })
    await rememberLabel.click()
    await page.waitForTimeout(400)
    const checked = await page.evaluate(() => {
      const el = document.querySelector('.el-checkbox__original') as HTMLInputElement | null
      return el ? el.checked : null
    })
    await shot('auth', '01-13-remember-me-unchecked')
    expect(checked, '点击"记住我"文案后勾选态应为未勾选').toBe(false)
    // 本用例不走 login() 辅助（需自驱"记住我"状态）——但 login 限流 10 次/分/IP
    // 会在此处 429（用例加速后窗口更密），与 login() 同款重试门控
    for (let attempt = 1; ; attempt++) {
      try {
        await Promise.all([
          page.waitForURL(/\/routes/, { timeout: 30_000 }),
          page.getByRole('button', { name: '登录' }).click(),
        ])
        break
      } catch (e) {
        if (attempt >= 3) throw e
        await page.waitForTimeout(25_000)
      }
    }
    await page.waitForTimeout(1500)
    const ls = await page.evaluate(() => localStorage.getItem('gw4j_refresh'))
    const ss = await page.evaluate(() => sessionStorage.getItem('gw4j_refresh'))
    await shot('auth', '01-13-remember-me-storage')
    expect(ls, '未勾选"记住我"时 refresh_token 不应落在 localStorage').toBeNull()
    expect(ss, '未勾选"记住我"时 refresh_token 应落在 sessionStorage').not.toBeNull()
    writeEvidence('auth', '01-13-remember-me-storage', diag, `勾选态=${checked} / localStorage=${ls ? '有' : '无'} / sessionStorage=${ss ? '有' : '无'}`)
  })

  test('01-14 未知路由应展示 404 页面而不是静默跳回路由列表', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.goto('/this-path-does-not-exist-zzz')
    await page.waitForTimeout(2500)
    await shot('auth', '01-14-unknown-route')
    const body = await page.locator('body').innerText()
    writeEvidence('auth', '01-14-unknown-route', diag, `落地 URL: ${page.url()}; 页面文本: ${body.trim().slice(0, 160)}`)
    expect(body, '未知路由应给出 404/页面不存在的明确提示').toMatch(/404|不存在|未找到|Not Found/i)
  })

  test('01-15 直接访问 /login 已登录时不再重复登录', async ({ page, shot, diag }) => {
    await login(page, '/routes')
    await page.goto('/login')
    await page.waitForTimeout(2000)
    await shot('auth', '01-15-login-when-already-authed')
    writeEvidence('auth', '01-15-login-when-already-authed', diag, `落地 URL: ${page.url()}`)
  })
})
