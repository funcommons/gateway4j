import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 200)))
p.on('console', m => { if (m.type() === 'error') console.log('[console.err]', m.text().slice(0, 200)) })
await p.goto('http://localhost:9302/login')
await p.locator('input').first().fill('admin')
await p.locator('input[type="password"]').first().fill('admin123')
await Promise.all([p.waitForURL(/\/routes/), p.getByRole('button', { name: '登录' }).click()])
await p.waitForTimeout(2000)

await p.goto('http://localhost:9302/routes/-100/canvas')
await p.waitForTimeout(3500)
const canvas = await p.evaluate(() => ({
  url: location.href,
  toolbarBtns: [...document.querySelectorAll('.canvas-toolbar button')].map(b => ({ txt: b.textContent?.trim(), disabled: b.disabled })),
  nodeTypes: [...document.querySelectorAll('[data-testid="node-type-item"]')].map(n => n.innerText?.trim()),
  nodeTypeAttrs: [...document.querySelectorAll('[data-testid="node-type-item"]')].map(n => n.getAttribute('draggable')),
  canvasShell: !!document.querySelector('.canvas-shell'),
  vueFlow: !!document.querySelector('.vue-flow'),
  nodes: document.querySelectorAll('.vue-flow__node').length,
  shellText: JSON.stringify(document.querySelector('.canvas-shell')?.innerText?.slice(0, 300)),
  propEmpty: document.querySelector('[data-testid="prop-no-selection"]')?.innerText,
  pathPreview: document.querySelector('[data-testid="path-preview"]')?.innerText,
  switchHtml: document.querySelector('.canvas-toolbar .fc-switch, .canvas-toolbar .el-switch')?.outerHTML?.slice(0, 400),
  toolbarHtml: document.querySelector('.canvas-toolbar')?.outerHTML?.slice(0, 2500),
}))
console.log('J. canvas:', JSON.stringify(canvas, null, 1))
await p.screenshot({ path: '/tmp/probe-canvas.png', fullPage: true })

// ===== 拖拽创建节点 =====
const before = await p.locator('.vue-flow__node').count()
const src = p.locator('[data-testid="node-type-item"]').first()
const dst = p.locator('.canvas-shell')
await src.dragTo(dst, { targetPosition: { x: 300, y: 200 } })
await p.waitForTimeout(1500)
const after = await p.locator('.vue-flow__node').count()
console.log('DRAG nodes before/after:', before, after)
const nodeInfo = await p.evaluate(() => ({
  nodes: document.querySelectorAll('.vue-flow__node').length,
  firstNodeHtml: document.querySelector('.vue-flow__node')?.outerHTML?.slice(0, 500),
}))
console.log('DRAG:', JSON.stringify(nodeInfo, null, 1))
await p.screenshot({ path: '/tmp/probe-canvas-drag.png', fullPage: true })

// 点击节点
if (after > 0) {
  await p.locator('.vue-flow__node').first().click()
  await p.waitForTimeout(1200)
  const prop = await p.evaluate(() => ({
    propPanel: !!document.querySelector('[data-testid="prop-panel-content"]'),
    propType: document.querySelector('[data-testid="prop-type"]')?.textContent,
    hasLabel: !!document.querySelector('[data-testid="prop-label"]'),
    hasUpstream: !!document.querySelector('[data-testid="prop-upstream"]'),
    hasPath: !!document.querySelector('[data-testid="prop-path"]'),
    propHtml: document.querySelector('.property-panel')?.innerText?.slice(0, 400),
    labelInputHtml: document.querySelector('[data-testid="prop-label"]')?.outerHTML?.slice(0, 300),
  }))
  console.log('PROP after click:', JSON.stringify(prop, null, 1))
  await p.screenshot({ path: '/tmp/probe-canvas-prop.png', fullPage: true })

  // 撤销/重做按钮状态
  const undo = await p.evaluate(() => {
    const bs = [...document.querySelectorAll('.canvas-toolbar button')]
    return bs.map(x => ({ txt: x.textContent?.trim(), disabled: x.disabled }))
  })
  console.log('UNDO/REDO btns:', JSON.stringify(undo))
}
console.log('pageerrors:', errs.length, JSON.stringify(errs.slice(0, 3)))
await b.close()
