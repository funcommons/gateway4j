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
    await expect(authedPage.locator('form').first()).toBeVisible({ timeout: 10_000 })
    await authedPage.locator('.el-form-item').first().locator('input').fill('e2e_test_route')
    const formItems = authedPage.locator('.el-form-item')
    await formItems.nth(2).locator('input').fill('/e2e/test/**')
    await formItems.nth(3).locator('input').fill('http://httpbin.org/get')
    const saveBtn = authedPage.locator('button:has-text("保存")').first()
    await expect(saveBtn).toBeVisible({ timeout: 10_000 })
    await saveBtn.click()
    await expect(authedPage.getByText(/保存成功|已保存/)).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Plugin List', () => {
  test('shows plugin list with table or grouped view', async ({ authedPage }) => {
    await authedPage.goto('/plugins')
    await expect(authedPage.locator('.el-table, .plugin-group').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Builtin Plugins', () => {
  test('shows builtin plugin cards', async ({ authedPage }) => {
    await authedPage.goto('/plugins/builtin')
    await expect(authedPage.locator('.type-card, .category-section').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Global Plugins', () => {
  test('shows global plugin list', async ({ authedPage }) => {
    await authedPage.goto('/plugins/global')
    await expect(authedPage.locator('.plugin-row, .fc-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})
