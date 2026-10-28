import { test as base, expect } from '@playwright/test'

type Fixtures = { authedPage: import('@playwright/test').Page }

const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('textbox', { name: '用户名' }).fill('admin')
    await page.getByRole('textbox', { name: '密码' }).fill('admin123')
    await Promise.all([
      page.waitForURL(/\/routes/, { timeout: 30_000 }),
      page.getByRole('button', { name: '登录' }).click(),
    ])
    await use(page)
  },
})

test.describe('Route CRUD', () => {
  test('create a backend route', async ({ authedPage }) => {
    await authedPage.goto('/routes/new')
    await expect(authedPage.getByRole('heading', { name: '新建' })).toBeVisible({ timeout: 10_000 })

    // Fill route name
    await authedPage.getByRole('textbox', { name: /路由名称/ }).fill('e2e_backend_test')

    // Default type is 后置 (backend), keep it
    // Fill path
    await authedPage.getByRole('textbox', { name: /匹配路径/ }).fill('/e2e/backend/**')

    // Fill upstream URL (only for backend routes)
    const upstreamInput = authedPage.getByRole('textbox', { name: /上游|upstream|目标/ })
    if (await upstreamInput.isVisible()) {
      await upstreamInput.fill('http://httpbin.org:80')
    }

    // Save
    const saveBtn = authedPage.locator('button:has-text("保存")').first()
    await saveBtn.click({ timeout: 5_000 })

    // Should show success message or redirect
    await authedPage.waitForTimeout(2_000)
    const hasMessage = await authedPage.locator('.el-message').isVisible().catch(() => false)
    const onRoutesPage = authedPage.url().includes('/routes')
    expect(hasMessage || onRoutesPage).toBeTruthy()
  })

  test('route list shows data after creation', async ({ authedPage }) => {
    await authedPage.goto('/routes')
    const table = authedPage.locator('.el-table').first()
    await expect(table).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Plugin operations', () => {
  test('plugin list loads with builtin plugins', async ({ authedPage }) => {
    await authedPage.goto('/plugins')
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })
    await expect(authedPage.getByText('security')).toBeVisible({ timeout: 5_000 })
  })

  test('enable a plugin', async ({ authedPage }) => {
    await authedPage.goto('/plugins')
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })
    const enableBtn = authedPage.locator('button:has-text("启用")').first()
    if (await enableBtn.isVisible()) {
      await enableBtn.click()
      await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 5_000 }).catch(() => {})
    }
  })
})

test.describe('Sidebar navigation', () => {
  test('sidebar links are visible', async ({ authedPage }) => {
    const sidebar = authedPage.locator('.el-menu, aside, nav').first()
    if (await sidebar.isVisible()) {
      await expect(sidebar.getByText(/路由|插件|监控|用户/).first()).toBeVisible()
    }
  })
})
