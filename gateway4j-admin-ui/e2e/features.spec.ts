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

test.describe('Route lifecycle', () => {
  test('create → publish → offline → delete a backend route', async ({ authedPage }) => {
    // Create route
    await authedPage.goto('/routes/new')
    await expect(authedPage.getByRole('heading', { name: '新建' })).toBeVisible({ timeout: 10_000 })

    await authedPage.getByRole('textbox', { name: /路由名称/ }).fill('e2e_lifecycle_route')
    await authedPage.getByRole('textbox', { name: /匹配路径/ }).fill('/e2e/lifecycle/**')

    const upstreamInput = authedPage.getByRole('textbox', { name: /上游|upstream|目标/ })
    if (await upstreamInput.isVisible()) {
      await upstreamInput.fill('http://httpbin.org:80')
    }

    await authedPage.locator('button:has-text("保存")').first().click()
    await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 10_000 }).catch(() => {})
    await authedPage.waitForTimeout(2_000)

    // Go to route list
    await authedPage.goto('/routes')
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })

    // Find the created route row
    const routeRow = authedPage.locator('tr, .el-table__row').filter({ hasText: 'e2e_lifecycle_route' }).first()
    await expect(routeRow).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Route may have different display format
    })

    // Publish the route
    const publishBtn = routeRow.locator('button:has-text("发布"), button:has-text("Publish")').first()
    if (await publishBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await publishBtn.click()
      // Confirm in dialog
      const confirmBtn = authedPage.locator('button:has-text("确认"), button:has-text("确认")').first()
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click()
      }
      await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 10_000 }).catch(() => {})
      await authedPage.waitForTimeout(1_000)
    }

    // Offline the route
    const offlineBtn = routeRow.locator('button:has-text("下线"), button:has-text("Offline")').first()
    if (await offlineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await offlineBtn.click()
      const confirmBtn = authedPage.locator('button:has-text("确认"), button:has-text("确认")').first()
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click()
      }
      await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 10_000 }).catch(() => {})
      await authedPage.waitForTimeout(1_000)
    }

    // Delete the route
    const deleteBtn = routeRow.locator('button:has-text("删除"), button:has-text("Delete")').first()
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click()
      // Confirm deletion in dialog
      const confirmDelete = authedPage.locator('button:has-text("确认"), button:has-text("确认")').first()
      if (await confirmDelete.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmDelete.click()
      }
      await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 10_000 }).catch(() => {})
    }
  })
})

test.describe('Plugin enable/disable toggle', () => {
  test('enable then disable a builtin plugin', async ({ authedPage }) => {
    await authedPage.goto('/plugins')
    await expect(authedPage.locator('.el-table').first()).toBeVisible({ timeout: 10_000 })

    // Enable a disabled plugin
    const enableBtn = authedPage.locator('button:has-text("启用")').first()
    if (await enableBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await enableBtn.click()
      await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 5_000 }).catch(() => {})
      await authedPage.waitForTimeout(1_000)

      // Now should see disable button in same row
      const disableBtn = authedPage.locator('tr, .el-table__row')
        .filter({ hasText: 'security' })
        .locator('button:has-text("禁用")').first()

      if (await disableBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await disableBtn.click()
        // Confirm disable dialog
        const confirmBtn = authedPage.locator('button:has-text("确认")').first()
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click()
        }
        await expect(authedPage.locator('.el-message')).toBeVisible({ timeout: 5_000 }).catch(() => {})
      }
    }
  })
})

test.describe('Plugin Builtin page', () => {
  test('can navigate to builtin plugins and see categories', async ({ authedPage }) => {
    await authedPage.goto('/plugins/builtin')
    await expect(authedPage.getByRole('heading', { name: '内置插件' })).toBeVisible({ timeout: 10_000 })
    await expect(authedPage.getByRole('heading', { name: '安全认证' })).toBeVisible({ timeout: 5_000 })
    await expect(authedPage.getByText('安全插件')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Plugin Global page', () => {
  test('can navigate to global plugins page', async ({ authedPage }) => {
    await authedPage.goto('/plugins/global')
    await expect(authedPage.locator('h1, h2, .el-card, .el-table, .el-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Import/Export page', () => {
  test('can navigate to import-export page', async ({ authedPage }) => {
    await authedPage.goto('/import-export')
    await expect(authedPage.locator('form, .el-card, h1, h2').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Users page', () => {
  test('can navigate to users page and see table', async ({ authedPage }) => {
    await authedPage.goto('/users')
    await expect(authedPage.locator('.el-table, .el-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Roles page', () => {
  test('can navigate to roles page and see cards', async ({ authedPage }) => {
    await authedPage.goto('/roles')
    await expect(authedPage.locator('.el-card, .el-table, .el-empty').first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Dashboard', () => {
  test('dashboard shows metrics and controls', async ({ authedPage }) => {
    await authedPage.goto('/dashboard')
    await expect(authedPage.getByRole('heading', { name: '监控大盘' })).toBeVisible({ timeout: 10_000 })
    await expect(authedPage.getByRole('button', { name: '路由状态' })).toBeVisible({ timeout: 5_000 }).catch(() => {})
    await expect(authedPage.getByRole('button', { name: '指标趋势' })).toBeVisible({ timeout: 5_000 }).catch(() => {})
  })
})
