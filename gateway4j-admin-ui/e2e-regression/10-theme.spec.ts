import { test, expect, login } from './helpers'
import type { Page } from '@playwright/test'

/**
 * BL-10 主题回归（深色主题护栏）。
 *
 * 为什么有这条线：深色主题在 2026-11-01 之前**从未生效过** ——
 * `theme.scss` 里 app-aliases 的 `:root` 排在 themes 的 `[data-theme="dark"]`
 * 之后（两者特异性都是 (0,1,0)），靠后的 :root 把暗色值整个盖掉；
 * 且 Element Plus 自己的暗色 token 挂在 `html.dark` 上，`<html>` 上从来没有
 * `dark` 类。上一轮把两处都修了，深色主题这才真的生效。
 *
 * 但**深色主题此前零自动化覆盖**，而它恰恰是那轮改动最大的行为变更 ——
 * 下次谁动了主题层，深色静默退化（白卡片配浅色字）不会有任何用例变红。
 * 这条线就是那圈护栏。
 *
 * —————— 2026-11-02 第二轮：把护栏改成「不可能空过」——————
 *
 * 上一轮这 7 条用例里有 3 条**可以自己绕过自己**（评审 Floor：护栏失效）：
 *   ① 断言包在 `if (x && y)` 里 —— 取不到值就整条跳过 = 绿；
 *   ② `parseRgb` 丢 alpha —— `rgba(0,0,0,0)` 被当成纯黑（半透明底当不透明黑）；
 *   ③ 10-02 拿**页面底**当基准算标题对比度，可标题在**卡片**里（基准面选错）；
 *   ④ 切主题后立刻读计算样式，可能读到 transition 中间值；
 *   ⑤ `switchTheme` 按色板**下标**选主题，THEMES 顺序一变就静默点错主题。
 *
 * 现在的统一约定：
 *   - **取不到值 = 失败**，绝不跳过：所有 `expect(...).not.toBeNull()` 都排在比较之前；
 *   - `parseRgb` **保留 alpha**，并提供「前景 alpha 合成 / 底色逐层合成到最近实底」，
 *     对比度一律在**合成后的真实颜色**上算；
 *   - 文字对比度以其**所在容器**的底色为基准（卡片里的字对卡片底，不是对页面底）；
 *   - 计算样式要读到**稳定值**（连续两次读数相同）才拿去断言；
 *   - 主题按**文案**（浅色 / 深色）选，不按下标。
 *
 * 断言方式：**读 token 与计算样式，不比对像素**。
 *   - token 层：`--app-bg-page` / `--app-text-primary` 等在 dark 下的取值
 *   - 渲染层：`.auth-page` / `.fc-shell` / `.fc-section` / `.fc-sidebar` 的
 *     计算后 background-color，以及文字与背景的对比度
 * 逐像素比对由 visual.spec.ts（opt-in）负责；这条线负责「深色到底有没有生效」。
 */

/** FcThemeProvider 的 localStorage 持久化 key（见 src/components/theme/FcThemeProvider.vue） */
const THEME_PERSIST_KEY = 'fc-theme-provider'

/** 不透明颜色 */
interface Rgb { r: number; g: number; b: number }
/** 带 alpha 的颜色（a ∈ [0,1]） */
interface Rgba extends Rgb { a: number }

/** 整页都没有实底时的画布兜底色 */
const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 }
/** 全透明 */
const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

/**
 * 解析 'rgb()' / 'rgba()'。
 * 兼容逗号分隔 `rgba(0, 0, 0, 0)` 与空格分隔 `rgb(107 112 120 / 0.5)`。
 *
 * **必须保留 alpha** —— 丢掉 alpha 会把半透明底当成不透明黑，
 * 后面所有对比度都在拿错颜色算。
 */
function parseRgb(value: string | null | undefined): Rgba | null {
  if (!value) return null
  const m = value.match(/rgba?\(([^)]*)\)/)
  if (!m) return null
  const body = m[1].trim()
  if (!body) return null
  const slash = body.split('/')
  const nums = slash[0].trim().split(/[\s,]+/).filter(Boolean).map(Number)
  if (nums.length < 3) return null
  if (nums.slice(0, 3).some((n) => Number.isNaN(n))) return null
  let a = 1
  if (slash.length > 1) {
    const parsed = parseFloat(slash[1])
    if (!Number.isNaN(parsed)) a = parsed
  } else if (nums.length > 3 && !Number.isNaN(nums[3])) {
    a = nums[3]
  }
  return { r: nums[0], g: nums[1], b: nums[2], a: Math.min(1, Math.max(0, a)) }
}

/** source-over 合成：fg 叠在 bg 之上（fg 在上） */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a)
  if (a <= 0) return { ...TRANSPARENT }
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  }
}

/** 丢弃 alpha（只对已经合成到实底上的颜色用） */
function opaque(c: Rgba): Rgb { return { r: c.r, g: c.g, b: c.b } }

/** 逐分量比较两个颜色是否相同（容差 1/255，防四舍五入噪声） */
function sameColor(a: Rgb, b: Rgb, tol = 1): boolean {
  return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol
}

/** WCAG 相对亮度 */
function luminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** WCAG 对比度（入参必须是实色 —— 由 over()/effectiveBg() 合成得到） */
function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** 祖先链的一层：自身背景色 + 自身 opacity */
interface Layer { color: Rgba | null; opacity: number }

/**
 * 底色逐层合成：从最内层往外，叠到**最近的实底**为止（更外层被完全遮挡就停）。
 *
 * 每层的 opacity 作用于它内部的全部内容（组透明度语义），
 * 所以半透明的卡片底会正确地透出页面底，而不是被当成不透明黑。
 */
function effectiveBg(chain: Layer[]): Rgb {
  // chain 由外到内：chain[0] = html，chain[last] = 目标元素本身
  let acc: Rgba = { ...TRANSPARENT }
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = chain[i]
    const bg = layer.color ?? { ...TRANSPARENT }
    // 元素自身背景垫在子树内容之下
    let subtree = over(acc, bg)
    // 元素 opacity 作用于它内部的全部内容
    subtree = { ...subtree, a: subtree.a * layer.opacity }
    acc = subtree
    // 已合成到不透明实底 —— 更外层完全看不见了，直接停
    if (acc.a >= 1 && layer.opacity >= 1) break
  }
  // 画布兜底
  return opaque(over(acc, CANVAS))
}

/**
 * 读元素的祖先链底色 + 自身 color（在浏览器里读 computed style）。
 * 元素不存在返回 null。
 */
async function paintChain(page: Page, selector: string) {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const chain: { color: string; opacity: number }[] = []
    let node: Element | null = el
    while (node) {
      const cs = getComputedStyle(node)
      const op = parseFloat(cs.opacity)
      chain.push({ color: cs.backgroundColor, opacity: Number.isNaN(op) ? 1 : op })
      node = node.parentElement
    }
    chain.reverse() // 由外到内：html → ... → 目标元素
    const cs = getComputedStyle(el)
    const op = parseFloat(cs.opacity)
    return {
      color: cs.color,
      opacity: Number.isNaN(op) ? 1 : op,
      chain,
    }
  }, selector)
}

/**
 * 元素的「有效前景色 / 有效背景色」。
 *   fg = color 合成到自身有效底色上（半透明正文色不再被当成实色）
 *   bg = 逐层合成到最近实底（半透明卡片底会正确透出页面底）
 * 元素不存在或 color 解析不出来 → null（调用方必须断言 not.toBeNull()）。
 */
async function paintOf(page: Page, selector: string): Promise<{ fg: Rgb; bg: Rgb } | null> {
  const info = await paintChain(page, selector)
  if (!info) return null
  const chain: Layer[] = info.chain.map((l) => ({
    color: parseRgb(l.color),
    opacity: l.opacity,
  }))
  const bg = effectiveBg(chain)
  const fgRaw = parseRgb(info.color)
  if (!fgRaw) return null
  const fg = opaque(over({ ...fgRaw, a: fgRaw.a * info.opacity }, { ...bg, a: 1 }))
  return { fg, bg }
}

/**
 * 探针：临时挂一个元素，用给定 CSS 解析出最终渲染色。
 * 用来读「token 的实际取值」—— 直接读 CSS 变量拿到的是声明值，
 * color-mix() / 主题层覆盖都要解析后才算数。
 */
async function probeColor(page: Page, css: string): Promise<string> {
  return page.evaluate((c) => {
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;height:1px;background:${c}`
    document.body.appendChild(el)
    const value = getComputedStyle(el).backgroundColor
    el.remove()
    return value
  }, css)
}

/** 读某个选择器首个元素的计算样式属性；元素不存在返回 null */
async function styleOf(page: Page, selector: string, prop: string): Promise<string | null> {
  return page.evaluate(
    ({ s, p }) => {
      const el = document.querySelector(s)
      return el ? getComputedStyle(el).getPropertyValue(p) : null
    },
    { s: selector, p: prop },
  )
}

/**
 * 读**稳定**的计算样式：连续两次读数相同才算稳定。
 *
 * 为什么不能直接读：`.fc-main` / `.fc-shell` 上有 `transition: background .25s ease`，
 * 切主题后立刻读会读到过渡中间值 —— 断言可能碰巧过，也可能碰巧不过（不稳定）。
 * 读不到稳定值一律当失败处理，不当「跳过」。
 */
async function stableStyleOf(page: Page, selector: string, prop: string): Promise<string> {
  let prev = await styleOf(page, selector, prop)
  if (prev === null) {
    throw new Error(`${selector} 不在页面上，无法读取 ${prop}`)
  }
  let settled = false
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(50)
    const cur = await styleOf(page, selector, prop)
    if (cur !== null && cur === prev) {
      settled = true
      break
    }
    prev = cur ?? prev
  }
  if (!settled) {
    throw new Error(`${selector} 的 ${prop} 在 5s 内一直在变化 —— 拿到的可能是过渡中间值，不能作为断言依据`)
  }
  return prev
}

/** 在 app 首个脚本执行前预置主题（Provider setup 时同步恢复，无首屏闪烁） */
function presetTheme(page: Page, theme: 'light' | 'dark') {
  return page.addInitScript(
    ({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state))
    },
    { key: THEME_PERSIST_KEY, state: { v: 1, brand: 'ldx2', theme } },
  )
}

/**
 * 主题色板的文案（FcThemeSwitcher 内置中英文两套，按 locale 取其一）。
 * 用**文案**匹配而不是下标 —— THEMES 数组顺序一变，按下标就会静默点错主题。
 */
const THEME_LABEL: Record<'light' | 'dark', RegExp> = {
  light: /^\s*(浅色|Light)\s*$/,
  dark: /^\s*(深色|Dark)\s*$/,
}

/** 打开顶栏的外观切换器并切到指定主题 */
async function switchTheme(page: Page, theme: 'light' | 'dark') {
  await page.locator('.fc-theme-switcher--trigger button').first().click()
  const swatches = page.locator('.fc-theme-switcher--popover .fc-ts-swatch')
  await expect(swatches.first(), '外观切换器应弹出主题色板').toBeVisible({ timeout: 10_000 })
  // 按文案选色板（浅色 / 深色），不按下标
  const target = swatches.filter({
    has: page.locator('.fc-ts-swatch__label', { hasText: THEME_LABEL[theme] }),
  })
  await expect(target.first(), `外观切换器应有「${theme === 'dark' ? '深色' : '浅色'}」色板`).toBeVisible({
    timeout: 10_000,
  })
  await target.first().click()
  // 等 Provider 的 watch -> applyToRoot 落地；
  // 这一条同时兜住「选错色板」—— 点错的话 data-theme 不会等于目标主题。
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10_000 })
}

test.describe('BL-10 主题回归', () => {
  test('10-01 浅色主题：html 属性与页面底色为浅', async ({ page }) => {
    await presetTheme(page, 'light')
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })

    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
    // 浅色态不该挂 dark 类 —— EP 的暗色 token 挂在 html.dark 上
    await expect(html).not.toHaveClass(/\bdark\b/)

    const bg = await paintOf(page, '.auth-page')
    expect(bg, '.auth-page 应能读出前景/底色').not.toBeNull()
    expect(luminance(bg!.bg), '浅色主题页面底色应为亮色').toBeGreaterThan(0.5)
  })

  test('10-02 深色主题：html 属性 + dark 类 + token 真的翻暗', async ({ page }) => {
    await presetTheme(page, 'dark')
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })

    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')
    // EP 的暗色 token 挂在 html.dark 上 —— 没有这个类，EP 面板会是白底配浅色字
    await expect(html).toHaveClass(/\bdark\b/)

    // token 层：页面底色翻暗、正文墨色翻亮
    const bgToken = parseRgb(await probeColor(page, 'var(--app-bg-page)'))
    const textToken = parseRgb(await probeColor(page, 'var(--app-text-primary)'))
    expect(bgToken, '--app-bg-page 应能解析成颜色').not.toBeNull()
    expect(textToken, '--app-text-primary 应能解析成颜色').not.toBeNull()
    expect(luminance(bgToken!), '深色主题 --app-bg-page 应为暗色').toBeLessThan(0.2)
    expect(luminance(textToken!), '深色主题 --app-text-primary 应为亮色').toBeGreaterThan(0.5)

    // 渲染层：登录页底色真的翻暗（而不是只有 html 属性变了）
    const pagePaint = await paintOf(page, '.auth-page')
    expect(pagePaint, '.auth-page 应能读出前景/底色').not.toBeNull()
    expect(luminance(pagePaint!.bg), '深色主题下 .auth-page 应为暗色').toBeLessThan(0.2)

    // 文字与底色对比度达标（正文门槛 4.5:1）。
    //
    // 基准面必须是**标题自己所在的卡片底**，不是页面底：
    // 深色下卡片底 #1a1d23 与页面底 #0e1116 是两个不同的颜色，
    // 拿页面底当基准算出来的对比度是错的。
    const card = await paintOf(page, '.auth-card')
    const title = await paintOf(page, '.auth-card .title')
    expect(card, '.auth-card 应能读出前景/底色').not.toBeNull()
    expect(title, '.auth-card 标题应有颜色').not.toBeNull()
    // 前提：卡片底 ≠ 页面底（否则这条断言本身就失去意义）
    expect(
      sameColor(card!.bg, pagePaint!.bg),
      '深色主题下卡片底与页面底应是两个不同的颜色（否则对比度基准无从谈起）',
    ).toBe(false)
    // 标题背后的底色 = 卡片底色（标题在卡片里，不在页面底上）
    expect(
      sameColor(title!.bg, card!.bg),
      '标题文字背后的底色应是卡片底色',
    ).toBe(true)
    expect(
      contrast(title!.fg, card!.bg),
      '深色主题下标题文字与卡片底对比度应 >= 4.5:1',
    ).toBeGreaterThanOrEqual(4.5)
  })

  test('10-03 深色主题：卡片底色翻暗（EP 面板不是白盒子）', async ({ page }) => {
    await presetTheme(page, 'dark')
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })

    const card = await paintOf(page, '.auth-card')
    expect(card, '.auth-card 应能读出前景/底色').not.toBeNull()
    // 这是上一轮的老坑：EP 面板底不跟主题走 → 白卡片配浅色字，读不了
    expect(luminance(card!.bg), '深色主题下 FcSectionCard 底色应为暗色').toBeLessThan(0.3)
  })

  test('10-04 顶栏切换器能把深色切出来（真实用户路径）', async ({ page }) => {
    // 切换器在主布局顶栏，登录页（blank layout）没有 —— 必须先登录
    await login(page, '/routes')
    await expect(page.locator('.fc-shell')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await switchTheme(page, 'dark')

    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    // 切主题后外壳有 `transition: background .25s ease` ——
    // 必须等计算样式稳定（连续两次读数相同）再断言，否则可能读到过渡中间值。
    await expect
      .poll(
        async () => {
          const raw = await stableStyleOf(page, '.fc-shell', 'background-color')
          const c = parseRgb(raw)
          return c ? luminance(c) : Number.NaN
        },
        { timeout: 15_000, message: '切换后 .fc-shell 底色应稳定为暗色' },
      )
      .toBeLessThan(0.25)

    await expect
      .poll(
        async () => {
          const raw = await stableStyleOf(page, '.fc-main', 'background-color')
          const c = parseRgb(raw)
          return c ? luminance(c) : Number.NaN
        },
        { timeout: 15_000, message: '切换后 .fc-main 底色应稳定为暗色' },
      )
      .toBeLessThan(0.25)
  })

  test('10-05 深色主题：刷新后保持（持久化）', async ({ page }) => {
    await login(page, '/routes')
    await expect(page.locator('.fc-shell')).toBeVisible({ timeout: 20_000 })
    await switchTheme(page, 'dark')

    await page.reload()
    await expect(page.locator('.fc-shell')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    await expect
      .poll(
        async () => {
          const raw = await stableStyleOf(page, '.fc-shell', 'background-color')
          const c = parseRgb(raw)
          return c ? luminance(c) : Number.NaN
        },
        { timeout: 15_000, message: '刷新后 .fc-shell 底色应稳定为暗色' },
      )
      .toBeLessThan(0.25)
  })

  test('10-06 深色主题：登录后的外壳/侧栏/表格全部翻暗', async ({ page }) => {
    await presetTheme(page, 'dark')
    await login(page, '/routes')
    await expect(page.locator('.fc-shell')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)

    const shell = await paintOf(page, '.fc-shell')
    const sidebar = await paintOf(page, '.fc-sidebar')
    expect(shell, '.fc-shell 应能读出背景色').not.toBeNull()
    expect(sidebar, '.fc-sidebar 应能读出背景色').not.toBeNull()
    expect(luminance(shell!.bg), '深色主题下外壳底色应为暗色').toBeLessThan(0.25)
    expect(luminance(sidebar!.bg), '深色主题下侧栏底色应为暗色').toBeLessThan(0.25)

    // EP 表格：白底表格配深色页面 = 上一轮的经典退化形态。
    // 表格必须在场 —— 上一版这里写的是 `if (table.isVisible())`，
    // 表格不出现就整条跳过（= 绿），等于没有护栏。
    const table = page.locator('.el-table').first()
    await expect(table, '路由列表应有 EP 表格（表格缺失会让本条护栏空过）').toBeVisible({
      timeout: 20_000,
    })
    const tableBg = await paintOf(page, '.el-table')
    expect(tableBg, '.el-table 应能读出背景色').not.toBeNull()
    expect(luminance(tableBg!.bg), '深色主题下 EP 表格底色不应是白盒子').toBeLessThan(0.4)

    // 表头也是 EP 的独立底色，一并守住
    const thead = await paintOf(page, '.el-table thead th')
    expect(thead, '.el-table 表头应能读出背景色').not.toBeNull()
    expect(luminance(thead!.bg), '深色主题下 EP 表格表头不应是白盒子').toBeLessThan(0.4)

    // 卡片底不能等于页面底（否则内容糊成一片，也说明卡片没接主题层）。
    // 逐分量比较，不比字符串；两个值都必须先断言非空。
    const card = await paintOf(page, '.fc-section')
    expect(card, '.fc-section 卡片应能读出背景色').not.toBeNull()
    expect(luminance(card!.bg), '深色主题下卡片底应为暗色').toBeLessThan(0.3)
    expect(
      sameColor(card!.bg, shell!.bg),
      '深色主题下卡片底不应与页面底完全相同',
    ).toBe(false)
  })

  test('10-07 深色主题：输入框描边可见（对比度 >= 3:1）', async ({ page }) => {
    await presetTheme(page, 'dark')
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 20_000 })

    // EP 的描边画在 wrapper 的 box-shadow 里（inset 1px），取值形如
    // 'rgba(r, g, b, 1) 0px 0px 0px 1px inset' —— 取第一段颜色即可。
    //
    // 上一版这里是 `if (cardBg && borderColor)` —— 取不到描边色就整条跳过，
    // 声称验了 3:1 其实什么都没测。现在取不到就是失败。
    const shadow = await styleOf(page, '.el-input__wrapper', 'box-shadow')
    expect(shadow, '应能读出输入框 wrapper 的 box-shadow').not.toBeNull()
    expect(shadow!.trim(), '输入框描边不应为 none（EP 用 inset box-shadow 画描边）').not.toBe('none')
    const borderColor = parseRgb(shadow!.match(/rgba?\([^)]*\)/)?.[0] ?? '')
    expect(borderColor, '应能读出输入框描边色').not.toBeNull()

    // 描边内外的底色：内 = wrapper 自己的填充，外 = 卡片底。
    const inner = await paintOf(page, '.el-input__wrapper')
    const outer = await paintOf(page, '.auth-card')
    expect(inner, '.el-input__wrapper 应能读出背景色').not.toBeNull()
    expect(outer, '.auth-card 应能读出背景色').not.toBeNull()

    // 描边色先合成到它所在的底色上（描边可能是半透明的）
    const borderOnInner = opaque(
      over({ ...borderColor!, a: borderColor!.a }, { ...inner!.bg, a: 1 }),
    )
    // WCAG 1.4.11：非文字 UI 边界对**相邻**颜色 ≥ 3:1 —— 内外两侧都要看
    const minContrast = Math.min(
      contrast(borderOnInner, inner!.bg),
      contrast(borderOnInner, outer!.bg),
    )
    expect(
      minContrast,
      '深色主题下输入框描边与相邻底色（内填充 / 外卡片）的对比度应 >= 3:1',
    ).toBeGreaterThanOrEqual(3)
  })
})
