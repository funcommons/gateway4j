import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
p.on('response', async r => { if (r.status()>=400) console.log('[HTTP', r.status(), ']', r.request().method(), r.url()) })
await p.goto('http://localhost:9302/login')
await p.locator('input').first().fill('admin')
await p.locator('input[type="password"]').first().fill('admin123')
await Promise.all([p.waitForURL(/\/routes/), p.getByRole('button', { name: '登录' }).click()])
await p.waitForTimeout(2000)

await p.goto('http://localhost:9302/plugins/global')
await p.waitForTimeout(2500)
console.log('G rows:', await p.locator('.plugin-row').count())
console.log('G names:', JSON.stringify(await p.locator('.plugin-row .plugin-name').allInnerTexts()))
console.log('G switches:', await p.locator('.plugin-row .fc-switch').count())
console.log('G drag handles:', await p.locator('.plugin-row .drag-handle').count())
console.log('G draggable attr:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.plugin-row')].map(r=>r.getAttribute('draggable')))))
console.log('G row0 html:', JSON.stringify((await p.locator('.plugin-row').first().innerHTML()).slice(0,900)))

// switch state
console.log('G switch classes:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.plugin-row .fc-switch')].map(s=>s.className))))

// POST tab
await p.locator('.fc-tab', { hasText: '后置' }).click()
await p.waitForTimeout(1500)
console.log('G POST names:', JSON.stringify(await p.locator('.plugin-row .plugin-name').allInnerTexts()))

// try drag: row0 -> row1
const rows = p.locator('.plugin-row')
const before = await p.locator('.plugin-row .plugin-name').allInnerTexts()
await rows.nth(0).dragTo(rows.nth(1))
await p.waitForTimeout(2500)
const after = await p.locator('.plugin-row .plugin-name').allInnerTexts()
console.log('DRAG before:', JSON.stringify(before))
console.log('DRAG after :', JSON.stringify(after))
await p.screenshot({ path: '/tmp/probe-global.png', fullPage: true })
await b.close()
