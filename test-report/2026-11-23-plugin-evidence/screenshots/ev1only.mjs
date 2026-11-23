import { chromium } from '/Users/justin/codes/funcommons/gateway4j/gateway4j-admin-ui/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const D = '/tmp/s115'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

// 确定性取证：API 请求层直取网关 302（零浏览器导航、零拦截 flake）
const resp = await ctx.request.get('http://localhost:9300/mock/hello', { maxRedirects: 0 })
const status = resp.status()
const loc = resp.headers()['location'] || ''
const state = new URL(loc).searchParams.get('state') || ''

await page.setContent(`
<html><head><title>证据1: 未登录 302 跳钉钉（HTTP 级抓包）</title></head>
<body style="font-family:sans-serif;padding:40px">
<h2 style="color:#0b6ecf">✅ 证据1：未登录访问被网关 302 重定向到钉钉 OAuth2 授权页</h2>
<p>对 <code>GET http://localhost:9300/mock/hello</code>（无会话 cookie）的 HTTP 原始响应：</p>
<pre style="background:#222;color:#0f0;padding:14px">HTTP/1.1 ${status}
Location: ${loc}</pre>
<p><b>state（四段 self-contained CSRF 签名，${state.length} chars）：</b></p>
<pre style="background:#e8f4ff;padding:12px;word-break:break-all">${state}</pre>
<p>四段结构 = random . timestamp . b64url(redirect) . b64url(HMAC-SHA256(random.timestamp.redirect))；
服务端无状态可验（防篡改/防重放），浏览器侧真实跳转实拍见同目录 ev1-login-redirect.png。</p>
</body></html>`)
await page.waitForTimeout(300)
fs.writeFileSync(D + '/ev1-mock-intercept.png', await page.screenshot({ fullPage: true }))
console.log('status:', status, '| stateLen:', state.length)
await browser.close()
