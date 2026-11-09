import { test as base, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

/** 报告根目录（与 playwright.regression.config.ts 中的 results.json 输出目录一致） */
export const REPORT_ROOT = path.resolve(process.cwd(), '../test-report/p4e-v2-01')
export const SHOT_ROOT = path.join(REPORT_ROOT, 'screenshots')

export const CREDENTIALS = { username: 'admin', password: 'admin123' }

/** 业务线编号 → 目录名 */
export const LINES = {
  auth: '01-auth',
  dashboard: '02-dashboard',
  routes: '03-routes',
  canvas: '04-canvas',
  importExport: '05-import-export',
  plugins: '06-plugins',
  users: '07-users',
  roles: '08-roles',
  settings: '09-settings',
  theme: '10-theme',
} as const

export type LineKey = keyof typeof LINES

/** 诊断信息：控制台错误、未捕获异常、失败的网络请求 */
export interface Diagnostics {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  httpErrors: string[]
  /** 全部后端 API 调用（METHOD URL -> status），用于证明"操作是否真的发出去了" */
  apiCalls: string[]
}

export interface RegressionFixtures {
  diag: Diagnostics
  /** 截图并记录到业务线目录 */
  shot: (line: LineKey, name: string, fullPage?: boolean) => Promise<string>
}

export const test = base.extend<RegressionFixtures>({
  diag: async ({ page }, use) => {
    const d: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], apiCalls: [] }
    page.on('console', (msg) => {
      if (msg.type() === 'error') d.consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => d.pageErrors.push(String(err)))
    page.on('requestfailed', (req) => {
      const f = req.failure()
      d.failedRequests.push(`${req.method()} ${req.url()} :: ${f ? f.errorText : 'unknown'}`)
    })
    page.on('response', (res) => {
      const u = res.url()
      if (u.includes('/v1/')) d.apiCalls.push(`${res.status()} ${res.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`)
      if (res.status() >= 400) d.httpErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`)
    })
    await use(d)
  },

  shot: async ({ page, diag }, use, testInfo) => {
    const shot = async (line: LineKey, name: string, fullPage = false) => {
      const dir = path.join(SHOT_ROOT, LINES[line])
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${name}.png`)
      // 等一帧，避免动画/骨架屏导致截图模糊
      await page.waitForTimeout(400)
      await page.screenshot({ path: file, fullPage })
      return file
    }
    await use(shot)

    // —— 失败时自动补全证据（整页截图 + 诊断日志）——
    if (testInfo.status !== testInfo.expectedStatus) {
      const line = lineFromTitle(testInfo.title)
      const dir = path.join(SHOT_ROOT, LINES[line])
      fs.mkdirSync(dir, { recursive: true })
      const slug = testInfo.title.replace(/[^\w一-龥.-]+/g, '_').slice(0, 80)
      await page.screenshot({ path: path.join(dir, `${slug}__FAIL.png`), fullPage: true }).catch(() => {})
      writeEvidence(line, `${slug}__FAIL`, diag, `失败断言详情见 playwright error-context / results.json`)
    }
  },
})

/** 从用例标题推导业务线目录：优先取 "BL-0N"（describe 前缀），回退到用例编号 "0N-xx" */
function lineFromTitle(title: string): LineKey {
  const map: Record<string, LineKey> = {
    '1': 'auth', '2': 'dashboard', '3': 'routes', '4': 'canvas',
    '5': 'importExport', '6': 'plugins', '7': 'users', '8': 'roles', '9': 'settings',
    '10': 'theme',
  }
  const byDescribe = title.match(/BL-0(\d{1,2})/)
  if (byDescribe) return map[byDescribe[1]] ?? 'auth'
  const byCase = title.match(/(?:^|\D)0?(\d{1,2})-\d\d/)
  if (byCase) return map[byCase[1]] ?? 'auth'
  return 'auth'
}

export { expect }

/** 登录并等待进入路由列表 */
export async function login(page: Page, redirect = '/routes') {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })
  await page.locator('input').first().fill(CREDENTIALS.username)
  await page.locator('input[type="password"]').first().fill(CREDENTIALS.password)
  // login 接口有 10 次/分钟/IP 自我保护限流（2026-10-28 快赢包），
  // beforeEach 级逐用例登录在单分钟内可能触顶 429 —— 此时滑动窗口 60s 内恢复，
  // 表单值保留，间隔重试点击即可；重试 3 次仍失败则照常抛错（不弱化断言）。
  for (let attempt = 1; ; attempt++) {
    try {
      await Promise.all([
        page.waitForURL(new RegExp(redirect.replace(/\//g, '\\/')), { timeout: 30_000 }),
        page.getByRole('button', { name: '登录' }).click(),
      ])
      break
    } catch (e) {
      if (attempt >= 3) throw e
      await page.waitForTimeout(25_000)
    }
  }
  // 注意：不要用 networkidle —— P2-7 起 dashboard/路由页持有 SSE 长连接，
  // networkidle 永不触发（每次空等 30s 超时，曾把整套件拖到 59 分钟）。
  await page.waitForTimeout(800)
}

/** 确认发布动作：P2-4 起发布走 PublishDescriptionDialog（变更说明必填 1~200 字，
 *  确认按钮 [data-testid=publish-desc-confirm] 填写后才启用）——该弹窗取代了旧
 *  fc-confirm-dialog。填入说明并点击其确认；若 3s 内未见该弹窗（旧交互/非发布），
 *  回退点击旧式 fc-confirm-dialog 确认按钮，两者皆无则抛错。 */
export async function confirmPublish(page: Page, text = 'e2e 自动化发布验证') {
  const input = page.locator('[data-testid="publish-desc-input"]')
  try {
    await input.waitFor({ state: 'visible', timeout: 3000 })
    await input.fill(text)
    await page.locator('[data-testid="publish-desc-confirm"]').click()
    return
  } catch {
    // 未见新弹窗，回退旧式确认
  }
  await confirmButton(page).click()
}

/** 生成不重复的测试用名称 */
export function uniq(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

/** 通过 el-form-item 标签文本定位表单控件（Element Plus 的 label-for 关联不稳定） */
export function formField(page: Page, label: string, tag: 'input' | 'textarea' = 'input') {
  return page
    .locator('.el-form-item')
    .filter({ has: page.locator('label', { hasText: label }) })
    .locator(tag)
    .first()
}

/** 确认弹窗（FcDialog.fc-confirm-dialog）里的确认按钮 */
export function confirmButton(page: Page) {
  return page.locator('.fc-dialog.fc-confirm-dialog:visible').getByRole('button', { name: '确认' })
}

/** 在已登录的浏览器上下文里直接调用同源后端 API（用于把"UI 缺陷"与"后端能力缺陷"区分开） */
export async function apiCall(
  page: Page,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; payload: any }> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const tok = localStorage.getItem('gw4j_token')
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      let payload: any = null
      const text = await res.text()
      try { payload = JSON.parse(text) } catch { payload = text }
      return { status: res.status, ok: res.ok, payload }
    },
    { method, url, body }
  )
}

/** 写入测试证据（诊断信息）到文件 */
export function writeEvidence(line: LineKey, name: string, diag: Diagnostics, extra?: string) {
  const dir = path.join(SHOT_ROOT, LINES[line])
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.log.txt`)
  const body = [
    `用例: ${name}`,
    `时间: ${new Date().toISOString()}`,
    '',
    '--- Console Errors ---',
    diag.consoleErrors.length ? diag.consoleErrors.join('\n') : '(无)',
    '',
    '--- Page Errors (未捕获异常) ---',
    diag.pageErrors.length ? diag.pageErrors.join('\n') : '(无)',
    '',
    '--- Failed Requests (网络失败) ---',
    diag.failedRequests.length ? diag.failedRequests.join('\n') : '(无)',
    '',
    '--- HTTP >= 400 ---',
    diag.httpErrors.length ? diag.httpErrors.join('\n') : '(无)',
    '',
    '--- 后端 API 调用记录 (status METHOD path) ---',
    diag.apiCalls.length ? diag.apiCalls.join('\n') : '(无)',
    extra ? `\n--- Extra ---\n${extra}` : '',
  ].join('\n')
  fs.writeFileSync(file, body, 'utf8')
  return file
}

/** 统一的"步骤"封装：执行 -> 截图 -> 记录诊断；失败时抛错并保留证据 */
export async function step<T>(
  page: Page,
  line: LineKey,
  name: string,
  fn: () => Promise<T>,
  opts: { fullPage?: boolean } = {}
): Promise<T> {
  try {
    const r = await fn()
    await page.screenshot({ path: path.join(ensureDir(line), `${name}.png`), fullPage: opts.fullPage ?? false })
    return r
  } catch (e) {
    await page.screenshot({ path: path.join(ensureDir(line), `${name}-FAIL.png`), fullPage: true }).catch(() => {})
    throw e
  }
}

function ensureDir(line: LineKey) {
  const dir = path.join(SHOT_ROOT, LINES[line])
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ═══════════════════════════════════════════════════════════════════════════
// v2 专属助手（P4e 迁移步 1 新增）—— 只增不改：上方旧助手原样保留。
// REPORT_ROOT 已在 P4e 收官步（步 5）换新目录 test-report/p4e-v2-01（与
// playwright.regression.config.ts results.json 输出同步），全量 11 spec 已打 v2。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * v2 登录：机制同 login()（UI 登录 admin/admin123 + 登录接口 10 次/分钟/IP 限流的
 * 25s×3 重试），但带 ?redirect= 参数 —— Login.vue:70 读 query.redirect 登录后跳转，
 * v2 默认落 /v2/overview。token 仍写 localStorage['gw4j_token']（v2 共享 auth store），
 * apiCall() 在 v2 页面上原样可用。
 */
export async function loginV2(page: Page, redirect = '/v2/overview') {
  await page.goto(`/login?redirect=${redirect}`)
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })
  await page.locator('input').first().fill(CREDENTIALS.username)
  await page.locator('input[type="password"]').first().fill(CREDENTIALS.password)
  // 锚定到主机后的路径（https?://host/redirect$）：goto 的 /login?redirect=/v2/... 本身
  // 就含 redirect 子串，若用裸子串正则会立即误匹配、429 重试期间提前放行（2026-11-09 实锤）
  const urlRe = new RegExp(`https?://[^/]+${redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
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
  // 不要用 networkidle：v2 同样持有 SSE 长连接（同 login() 注释）
  await page.waitForTimeout(800)
}

/**
 * v2 语义表格行定位。v2 行级 DOM 契约：行 testid 落在 <tr>，形如
 * usr-row-42 / rol-row-3。传纯数字按行 id 精确匹配；传其他文本按行内内容过滤
 * （如用户名 'admin'）。
 */
export function v2Row(page: Page, testidPrefix: string, idOrText: string | number) {
  const p = String(idOrText)
  return /^\d+$/.test(p)
    ? page.locator(`[data-testid="${testidPrefix}-row-${p}"]`)
    : page.locator(`[data-testid^="${testidPrefix}-row-"]`).filter({ hasText: p })
}

/**
 * v2 行内动作按钮：testid 形如 usr-action-edit-7 / rol-action-perm-2（动作名带 -{id} 后缀）。
 * prefix 传行前缀（如 'usr'），name 传动作名（如 'edit'）；id 传行 id 可精确定位单行按钮。
 */
export function v2RowAction(page: Page, testidPrefix: string, name: string, id?: string | number) {
  return id === undefined
    ? page.locator(`[data-testid^="${testidPrefix}-action-${name}-"]`)
    : page.locator(`[data-testid="${testidPrefix}-action-${name}-${id}"]`)
}

/**
 * v2 页内 toast 反馈定位（a11y live region 镜像，页面常驻渲染于页脚）：
 * testid 形如 usr-toast-success / rol-toast-error / set-toast-success。
 * prefix 传业务页前缀含连字符（'usr-' / 'rol-' / 'set-'），kind 为 'success' | 'error'。
 */
export function v2Toast(page: Page, kind: 'success' | 'error', prefix = '') {
  return page.locator(`[data-testid="${prefix}toast-${kind}"]`)
}

/** v2 确认弹窗（useFcConfirm → FcConfirm → FcDialog.fc-confirm-dialog）的「确认」按钮 */
export function v2Confirm(page: Page) {
  return page.locator('.fc-dialog.fc-confirm-dialog:visible').getByRole('button', { name: '确认' })
}

/** v2 确认弹窗的「取消」按钮 */
export function v2Cancel(page: Page) {
  return page.locator('.fc-dialog.fc-confirm-dialog:visible').getByRole('button', { name: '取消' })
}

/**
 * v2 发布流：发布不再是弹窗，而是独立页 /v2/publish/:id —— 填变更说明
 * pub-desc-input（必填 1~200 字，为空则 pub-publish-btn disabled）后点 pub-publish-btn。
 * 供步 3（03-routes / 04-canvas）迁移发布类用例使用。
 */
export async function confirmPublishV2(page: Page, text = 'e2e 自动化发布验证') {
  const input = page.locator('[data-testid="pub-desc-input"]')
  await input.waitFor({ state: 'visible', timeout: 15_000 })
  await input.fill(text)
  await page.locator('[data-testid="pub-publish-btn"]').click()
}
