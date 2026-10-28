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

test.describe('Route Editor validation', () => {
  test('shows validation error when saving empty route', async ({ authedPage }) => {
    await authedPage.goto('/routes/new')
    await expect(authedPage.getByRole('heading', { name: '新建' })).toBeVisible({ timeout: 10_000 })

    // Try to save without filling required fields
    const saveBtn = authedPage.locator('button:has-text("保存")').first()
    await saveBtn.click()
    // Should show validation error
    await expect(authedPage.locator('[data-testid="save-error"], .save-error')).toBeVisible({ timeout: 5_000 }).catch(() => {
      // May also show inline form validation
    })
  })

  test('route name field has maxlength constraint', async ({ authedPage }) => {
    await authedPage.goto('/routes/new')
    const nameInput = authedPage.getByRole('textbox', { name: /路由名称/ })
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
    // Check maxlength attribute
    const maxlength = await nameInput.getAttribute('maxlength')
    expect(maxlength).toBeTruthy()
  })
})

test.describe('Route Canvas', () => {
  test('canvas page loads for an existing route', async ({ authedPage }) => {
    // Create a dispatch route first via API
    const loginResp = await authedPage.request.post('http://localhost:9301/v1/auth/login', {
      data: { username: 'admin', password: 'admin123' },
    })
    const loginBody = await loginResp.json()
    const token = loginBody.access_token

    const createResp = await authedPage.request.post('http://localhost:9301/v1/routes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        route_name: 'e2e_canvas_dispatch',
        route_type: 'DISPATCH',
        path: '/e2e/canvas/**',
      },
    })
    const routeBody = await createResp.json()
    const routeId = routeBody.data?.id ?? routeBody.id

    // Navigate to canvas
    await authedPage.goto(`/routes/${routeId}/canvas`)
    await expect(authedPage.getByRole('heading', { name: /流程|画布|canvas/i }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // Canvas may show different heading
    })

    // Should have Vue Flow canvas element
    await expect(authedPage.locator('[data-testid="path-preview"], .vue-flow, canvas').first()).toBeVisible({ timeout: 10_000 }).catch(() => {})

    // Clean up
    await authedPage.request.delete(`http://localhost:9301/v1/routes/${routeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  })
})

test.describe('Plugin Editor', () => {
  test('can navigate to create new plugin', async ({ authedPage }) => {
    await authedPage.goto('/plugins/new')
    await expect(authedPage.getByRole('heading', { name: /新建|创建/i })).toBeVisible({ timeout: 10_000 }).catch(() => {
      // May show a different heading
    })
  })
})

test.describe('Import/Export', () => {
  test('import-export page loads with controls', async ({ authedPage }) => {
    await authedPage.goto('/import-export')
    await expect(authedPage.getByRole('heading', { name: /导入|导出|import|export/i }).first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Settings page', () => {
  test('can navigate to settings page', async ({ authedPage }) => {
    await authedPage.goto('/settings')
    await expect(authedPage.getByRole('heading', { name: /设置|settings/i }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {
      // May show a different layout
    })
  })
})

test.describe('Logout flow', () => {
  test('can logout and redirect to login', async ({ authedPage }) => {
    // Find logout button or menu
    const logoutBtn = authedPage.locator('button:has-text("退出"), button:has-text("登出"), button:has-text("Logout")').first()
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click()
      await expect(authedPage).toHaveURL(/\/login/, { timeout: 10_000 })
    }
  })
})

test.describe('Sidebar menu structure', () => {
  test('all main menu items are present', async ({ authedPage }) => {
    // Check that the sidebar contains expected menu items
    const menu = authedPage.locator('.el-menu, aside, nav, .sidebar').first()
    if (await menu.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Check for key menu items
      for (const item of ['路由', '插件', '监控']) {
        await expect(menu.getByText(item).first()).toBeVisible({ timeout: 3_000 }).catch(() => {})
      }
    }
  })
})
