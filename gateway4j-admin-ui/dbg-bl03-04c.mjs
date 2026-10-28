import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
let errCount = 0
const errs = []
p.on('pageerror', e => { errCount++; if (errs.length < 3) errs.push(String(e).slice(0, 200)) })
await p.goto('http://localhost:9302/login')
await p.locator('input').first().fill('admin')
await p.locator('input[type="password"]').first().fill('admin123')
await Promise.all([p.waitForURL(/\/routes/), p.getByRole('button', { name: '登录' }).click()])
await p.waitForTimeout(2000)

// ===== CASE 1: 仅切到 DISPATCH 类型 (不点条件 tab) =====
await p.goto('http://localhost:9302/routes/new')
await p.waitForTimeout(2000)
errCount = 0
await p.locator('.fc-segmented__item', { hasText: '分发' }).first().click()
await p.waitForTimeout(2500)
console.log('CASE1 (switch DISPATCH) pageerrors:', errCount, JSON.stringify(errs))

// ===== CASE 2: 切到 分发条件 tab =====
errCount = 0; errs.length = 0
await p.locator('.fc-tab', { hasText: '分发条件' }).first().click()
await p.waitForTimeout(2500)
console.log('CASE2 (open conditions tab) pageerrors:', errCount, JSON.stringify(errs))

// ===== CASE 3: 点 添加分发条件 =====
errCount = 0; errs.length = 0
await p.getByRole('button', { name: '添加分发条件' }).click({ timeout: 5000 }).catch(e => console.log('CASE3 click failed:', String(e).slice(0,150)))
await p.waitForTimeout(3000)
console.log('CASE3 (add condition) pageerrors:', errCount, JSON.stringify(errs))
const rows = await p.locator('.el-table__body-wrapper tbody tr').count()
console.log('CASE3 rows in conditions table:', rows)
await p.screenshot({ path: '/tmp/probe-cond3.png', fullPage: true }).catch(() => {})

// ===== CASE 4: 插件绑定 tab =====
errCount = 0; errs.length = 0
await p.locator('.fc-tab', { hasText: '插件绑定' }).first().click().catch(e => console.log('tab click failed'))
await p.waitForTimeout(2500)
console.log('CASE4 (open bindings tab) pageerrors:', errCount, JSON.stringify(errs))

// ===== CASE 5: 插件链 tab =====
errCount = 0; errs.length = 0
await p.locator('.fc-tab', { hasText: '插件链' }).first().click().catch(e => console.log('tab click failed'))
await p.waitForTimeout(2500)
console.log('CASE5 (open chain tab) pageerrors:', errCount, JSON.stringify(errs))
const chainTxt = await p.locator('.fc-tab-pane').innerText().catch(() => 'N/A')
console.log('CASE5 chain pane text:', JSON.stringify(chainTxt.slice(0, 200)))
await p.screenshot({ path: '/tmp/probe-chain.png', fullPage: true }).catch(() => {})

await b.close()
