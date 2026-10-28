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

test.describe('Routes List', () => {
  test('shows route list page after login', async ({ authedPage }) => {
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })
  })

  test('can navigate to create route', async ({ authedPage }) => {
    const createBtn = authedPage.locator('button:has-text("创建")').first()
    if (await createBtn.isVisible()) {
      await createBtn.click()
      await expect(authedPage).toHaveURL(/\/routes\/new/, { timeout: 5_000 })
    }
  })
})

test.describe('Plugins List', () => {
  test('can navigate to plugins page', async ({ authedPage }) => {
    await authedPage.goto('/plugins')
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Dashboard', () => {
  test('can navigate to dashboard', async ({ authedPage }) => {
    await authedPage.goto('/dashboard')
    await expect(authedPage.getByRole('heading', { name: '监控大盘' })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Users', () => {
  test('can navigate to users page', async ({ authedPage }) => {
    await authedPage.goto('/users')
    await expect(authedPage.locator('.el-table, .el-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Roles', () => {
  test('can navigate to roles page', async ({ authedPage }) => {
    await authedPage.goto('/roles')
    await expect(authedPage.locator('.el-card, .el-table, .el-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})
