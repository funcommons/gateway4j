import { chromium } from '/Users/justin/codes/funcommons/gateway4j/gateway4j-admin-ui/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const R = {}
const D = '/tmp/s115'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
try {
  // ===== 证据 1: 未登录 → 302 跳钉钉（拦截外部跳转展示 Location+state） =====
  await page.route('**login.dingtalk.com**', async (route) => {
    try {
      const loc = route.request().url()
      const state = new URL(loc).searchParams.get('state') || ''
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body:
        `<html><head><title>MOCK: 钉钉授权页跳转拦截</title></head><body style="font-family:sans-serif;padding:40px">` +
        `<h2 style="color:#0b6ecf">✅ 证据1：未登录访问被 302 重定向到钉钉 OAuth2 授权页</h2>` +
        `<p>浏览器被网关插件重定向至（真实钉钉域名，此处拦截展示）：</p>` +
        `<pre style="background:#f4f4f4;padding:12px;word-break:break-all">${loc}</pre>` +
        `<p><b>state（四段 self-contained CSRF 签名，${state.length} chars）：</b></p>` +
        `<pre style="background:#e8f4ff;padding:12px;word-break:break-all">${state}</pre>` +
        `<p>四段结构 = random . timestamp . b64url(redirect) . b64url(HMAC-SHA256)</p></body></html>` })
    } catch {}
  })
  await page.goto('http://localhost:9300/mock/hello')
  await page.waitForTimeout(1500)
  R.ev1Url = page.url()
  await page.screenshot({ path: D + '/ev1-login-redirect.png', fullPage: true })
  // 解析 state 供后续回调
  const loc1 = R.ev1Url
  R.ev1State = new URL(loc1).searchParams.get('state')

  // ===== 证据 2: 构造回调 → JWT cookie + 302 回原 URL → 上游页面（水印+X-User 回显） =====
  await page.goto(`http://localhost:9300/mock/hello?authCode=mock-code-e2e&state=${R.ev1State}`)
  await page.waitForTimeout(2500)
  R.ev2Url = page.url()
  R.ev2Cookies = await ctx.cookies('http://localhost:9300')
  R.ev2CookieInfo = R.ev2Cookies.filter((c) => c.name === 'fu-gw-token').map((c) => ({ name: c.name, httpOnly: c.httpOnly, expires: c.expires > 0 ? 'session+expiry' : c.expires }))
  await page.screenshot({ path: D + '/ev2-logged-in-watermark.png', fullPage: true })
  // 页面内容断言
  R.ev2Body = await page.evaluate(() => ({
    upstreamOk: document.body.innerText.includes('UPSTREAM OK'),
    xuserEcho: document.querySelector('#xuser')?.textContent || null,
    watermarkDivs: [...document.querySelectorAll('div')].filter((d) => (d.style.backgroundImage || '').includes('data:image')).length,
    watermarkScripts: [...document.querySelectorAll('script')].filter((s) => /FuSecurityWatermark|MutationObserver|crc16/.test(s.textContent)).length,
    watermarkHasObserver: [...document.querySelectorAll('script')].some((s) => /MutationObserver/.test(s.textContent)),
    watermarkHasCrc: [...document.querySelectorAll('script')].some((s) => /crc16/i.test(s.textContent)),
    wmTextSample: (() => { const d = [...document.querySelectorAll('div')].find((x) => (x.style.backgroundImage || '').includes('data:image')); return d ? (d.style.backgroundImage.slice(0, 30) + '...') : null })(),
  }))

  // ===== 证据 3: 水印用户化判定（HttpOnly cookie 下 JS 读不到 nick → 静态文案） =====
  R.ev3 = await page.evaluate(() => {
    const readable = document.cookie
    return { documentCookieReadable: readable, fuGwTokenReadable: readable.includes('fu-gw-token'), note: 'HttpOnly cookie 对 document.cookie 不可见' }
  })

  // ===== 证据 4: 防删——删除水印 DOM → MutationObserver 自动恢复 =====
  const before = await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => (d.style.backgroundImage || '').includes('data:image')).length)
  await page.evaluate(() => { [...document.querySelectorAll('div')].filter((d) => (d.style.backgroundImage || '').includes('data:image')).forEach((d) => d.remove()) })
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => (d.style.backgroundImage || '').includes('data:image')).length)
  R.ev4 = { beforeDelete: before, afterDeleteWait: after, restored: after > 0 }
  await page.evaluate(() => { const d = [...document.querySelectorAll('div')].filter((x) => (x.style.backgroundImage || '').includes('data:image')); if (d[0]) { d[0].style.outline = '3px solid red'; d[0].style.outlineOffset = '-3px' } })
  await page.screenshot({ path: D + '/ev4-watermark-antiremove.png', fullPage: true })

  // ===== 证据 5: 篡改 state → 401 JSON =====
  await page.goto(`http://localhost:9300/mock/hello?authCode=x&state=tampered.111.${(R.ev1State || '').split('.').slice(2).join('.')}`)
  await page.waitForTimeout(1000)
  R.ev5Body = await page.evaluate(() => document.body.innerText.slice(0, 200))
  await page.screenshot({ path: D + '/ev5-tampered-401.png' })

  // ===== 证据 6: logout → 清 cookie；再访问 → 302 重登（拦截展示新 state） =====
  await page.goto('http://localhost:9300/mock/logout')
  await page.waitForTimeout(1000)
  R.ev6LogoutBody = await page.evaluate(() => document.body.innerText.slice(0, 120))
  R.ev6CookiesAfterLogout = (await ctx.cookies('http://localhost:9300')).filter((c) => c.name === 'fu-gw-token').length
  await page.goto('http://localhost:9300/mock/hello')
  await page.waitForTimeout(1500)
  R.ev6AfterLogoutUrl = page.url().includes('login.dingtalk.com') ? '302 → login.dingtalk.com' : page.url()
  await page.screenshot({ path: D + '/ev6-after-logout.png' })
} catch (e) { R.FATAL = String(e).slice(0, 300) }
fs.writeFileSync(D + '/run.json', JSON.stringify(R, null, 2))
console.log('S115', JSON.stringify(R))
await browser.close()
