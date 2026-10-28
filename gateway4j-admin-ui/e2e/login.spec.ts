import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login form', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: '用户名' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '密码' })).toBeVisible()
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
  })

  test('login with valid credentials redirects to routes', async ({ page }) => {
    await page.getByRole('textbox', { name: '用户名' }).fill('admin')
    await page.getByRole('textbox', { name: '密码' }).fill('admin123')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/\/routes/, { timeout: 15_000 })
  })

  test('login with wrong password shows error message', async ({ page }) => {
    await page.getByRole('textbox', { name: '用户名' }).fill('admin')
    await page.getByRole('textbox', { name: '密码' }).fill('wrong')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.getByText(/系统繁忙|密码|用户名|错误|失败/)).toBeVisible({ timeout: 5_000 })
  })
})
