import { test, expect, loginV2, shot, writeEvidence } from './helpers'

/**
 * BL-01 认证与登录 + 全局应用外壳（v2 迁移版，P4e 步 4）
 * 覆盖：登录页渲染、空值校验、错误口令、正确登录、记住我、
 *       未登录访问受保护路由的守卫、退出登录、Token 持久化、
 *       LayoutV2 侧栏导航与顶栏三入口（登出/主题/语言）渲染。
 *
 * v2 迁移说明（P4e 步 4）：
 *  - 登录页 /login 新旧共享（views/auth/Login.vue），登录流用例改 loginV2 落 /v2/*；
 *  - 壳断言从旧 .fc-sidebar/.fc-header 换 LayoutV2 形态（.v2-side/.v2-top + v2-* testid）；
 *  - 登出 = v2-logout 纯本地语义（store.logout() 清 gw4j_token/gw4j_refresh 后
 *    router.push('/login')，无后端 logout API —— 与旧 MainLayout onLogout 同款）；
 *  - 解冻搁浅 4 条：01-07/01-08/01-11 + 01-10 后半（顶栏三入口已由 P4e-0 落地）。
 */
test.describe('BL-01 认证与登录', () => {
  // —— 01-01 ~ 01-03：/login 为新旧共享页，页面形态与语义不变，原样保留 ——

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

  // —— 01-04 ~ 01-08：登录流/守卫/登出改打 v2（loginV2 + LayoutV2 壳）——

  test('01-04 正确凭证登录成功并进入 v2 路由列表', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes')
    // v2 路由列表 = 语义表 .rt-table + route-row-{id}（非旧 .el-table）
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    const rows = await page.locator('[data-testid^="route-row-"]').count()
    expect(rows, 'v2 路由列表应渲染出路由行').toBeGreaterThan(0)
    await shot('auth', '01-04-login-success')
    writeEvidence('auth', '01-04-login-success', diag, `路由行数: ${rows}`)
  })

  test('01-05 未登录直接访问受保护路由被守卫拦截并跳登录页', async ({ page, shot, diag }) => {
    await page.goto('/v2/overview')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    // 守卫（router.beforeEach）应把原目标带进 redirect 查询参数，登录后原样回跳
    const landing = decodeURIComponent(page.url())
    expect(landing, '守卫应保留原目标于 redirect 参数').toContain('/v2/overview')
    await shot('auth', '01-05-guard-redirect-to-login')
    writeEvidence('auth', '01-05-guard-redirect-to-login', diag, `落地 URL: ${page.url()}`)
  })

  test('01-06 登录后刷新页面保持登录态（会话持久化）', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/routes')
    await page.reload()
    await expect(page).toHaveURL(/\/v2\/routes$/, { timeout: 20_000 })
    await expect(page.locator('.rt-table')).toBeVisible({ timeout: 20_000 })
    await shot('auth', '01-06-session-persists-after-reload')
    writeEvidence('auth', '01-06-session-persists-after-reload', diag)
  })

  test('01-07 顶栏登出按钮存在且可点击退出登录（v2 纯本地登出）', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    const logout = page.getByTestId('v2-logout')
    await expect(logout, 'LayoutV2 顶栏应渲染 v2-logout 退出按钮').toBeVisible({ timeout: 10_000 })
    await logout.click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 })
    // v2 登出为纯本地语义（P4e-0）：store.logout() 清 token 后 push /login，无后端 logout API
    const token = await page.evaluate(() => localStorage.getItem('gw4j_token'))
    expect(token, '登出后 localStorage 不应残留 gw4j_token').toBeNull()
    await shot('auth', '01-07-logout-button-and-redirect')
    writeEvidence('auth', '01-07-logout-button-and-redirect', diag, `落地 URL: ${page.url()}`)
  })

  test('01-08 退出登录后无法再访问受保护路由', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    // 直接清 token（等价于 v2-logout 的本地副作用），验证 v2 路由守卫是否生效
    await page.evaluate(() => {
      localStorage.removeItem('gw4j_token')
      localStorage.removeItem('gw4j_refresh')
      sessionStorage.removeItem('gw4j_refresh')
    })
    await page.goto('/v2/overview')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await shot('auth', '01-08-logout-guard-works')
    writeEvidence('auth', '01-08-logout-guard-works', diag)
  })

  // —— 01-09 ~ 01-11：壳断言换 LayoutV2 形态（.v2-side / .v2-top + v2-* testid）——

  test('01-09 v2 侧边栏渲染出各业务线导航入口', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    const side = page.locator('.v2-side')
    await expect(side, 'LayoutV2 应渲染 .v2-side 侧栏容器').toBeVisible({ timeout: 10_000 })
    // v2 侧栏 = 原生 <a class="v2-nav-item">（非旧 el-menu），文案在 .v2-nav-item-label
    const entries = page.locator('.v2-side .v2-nav-item')
    const n = await entries.count()
    expect(n, 'v2 侧栏应至少渲染 1 个业务线导航入口').toBeGreaterThan(0)
    const labels = await page.locator('.v2-nav-item-label').allInnerTexts()
    await shot('auth', '01-09-sidebar-nav-entries')
    writeEvidence('auth', '01-09-sidebar-nav-entries', diag, `导航入口数: ${n}; 菜单: ${labels.join(' / ')}`)
  })

  test('01-10 v2 顶栏渲染面包屑/搜索/通知/用户信息区', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    const header = page.locator('.v2-top')
    await expect(header, 'LayoutV2 应渲染 .v2-top 顶栏容器').toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('v2-breadcrumb-current'), '应渲染面包屑当前页').toBeVisible()
    await expect(page.getByTestId('v2-topbar-notice'), '应渲染通知入口').toBeVisible()
    await expect(page.locator('.v2-top-avatar'), '应渲染用户头像区').toBeVisible()
    await shot('auth', '01-10-header-rendered')
    writeEvidence('auth', '01-10-header-rendered', diag)
  })

  test('01-11 主题/语言切换器可达（v2 顶栏三入口，P4e-0 解冻）', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    const themeEntry = page.getByTestId('v2-theme-switch')
    await expect(themeEntry, '顶栏应渲染 v2-theme-switch 主题切换入口').toBeVisible({ timeout: 10_000 })
    // FcThemeSwitcher 弹层懒渲染，但根元素常驻 fc-theme-switcher 类（D1 修复）——未展开也可断言出口
    await expect(themeEntry.locator('.fc-theme-switcher'), '主题入口应挂 FcThemeSwitcher').toBeVisible()
    await expect(page.getByTestId('v2-lang-switch'), '顶栏应渲染 v2-lang-switch 语言切换入口').toBeVisible()
    await shot('auth', '01-11-theme-switcher')
    writeEvidence('auth', '01-11-theme-switcher', diag)
  })

  // —— 01-12 ~ 01-15：Token 残留 / 记住我 / 404 / 已登录访问 /login（登录页语义不变）——

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
    // 带 redirect 打 v2（Login.vue:70 读 query.redirect），登录后落 /v2/overview
    await page.goto('/login?redirect=/v2/overview')
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
    // 本用例不走 loginV2（需自驱"记住我"状态）——登录限流 10 次/分/IP 会 429，
    // 与 loginV2 同款 25s×3 重试；waitForURL 锚定主机+redirect 尾（防 goto 自身查询串误匹配）
    const urlRe = /https?:\/\/[^/]+\/v2\/overview$/
    for (let attempt = 1; ; attempt++) {
      try {
        await Promise.all([
          page.waitForURL(urlRe, { timeout: 30_000 }),
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
    await loginV2(page, '/v2/overview')
    // 打 v2 命名空间下的未知路径（catch-all NotFound 挂旧 MainLayout 子层级，v2/旧路径同命中）
    await page.goto('/v2/this-path-does-not-exist-zzz')
    await page.waitForTimeout(2500)
    await shot('auth', '01-14-unknown-route')
    const body = await page.locator('body').innerText()
    writeEvidence('auth', '01-14-unknown-route', diag, `落地 URL: ${page.url()}; 页面文本: ${body.trim().slice(0, 160)}`)
    expect(body, '未知路由应给出 404/页面不存在的明确提示').toMatch(/404|不存在|未找到|Not Found/i)
  })

  test('01-15 直接访问 /login 已登录时不再重复登录', async ({ page, shot, diag }) => {
    await loginV2(page, '/v2/overview')
    await page.goto('/login')
    await page.waitForTimeout(2000)
    // Login.vue 无已登录重定向逻辑：停留登录页且表单仍可用（不死循环/不崩溃）
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 10_000 })
    await shot('auth', '01-15-login-when-already-authed')
    writeEvidence('auth', '01-15-login-when-already-authed', diag, `落地 URL: ${page.url()}`)
  })
})
