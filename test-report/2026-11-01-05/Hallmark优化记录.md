# Hallmark 优化记录 · 2026-11-01-05

> 目标：在 `/hallmark`（app screen · polish）与 `/fc-web-sdk`（Fc SDK 组件契约 + token 纪律）
> 两套规范前提下，优化 gateway4j 管理后台的全部界面。
> 命令面为 **polish** —— 只修材质半边（token / 对比度 / 焦点 / 状态 / 间距 / 动效），
> **不重构**：页面结构、信息架构、DOM 层级、`data-testid`、既有类名一律不动。

---

## 一、结论

| 指标 | 改造前（HEAD `c9365d7`） | 改造后 |
|---|---|---|
| sloplint 静态层（78 文件） | **228 FAIL · 68 REFLEX · 17 WARN** | **0 · 0 · 0** |
| sloplint render 层（`--render`，登录页） | 未跑 | **0 FAIL · 0 REFLEX · 0 WARN** |
| 全站文字对比度自检（7 页 × 明暗双主题） | 48 处越线（实测） | **0 处**（余 1 处为 disabled 控件，规范豁免） |
| eslint | 0 error | **0 error**（127 warning，与基线同源） |
| type-check | 16（既有基线） | **16**（零新增） |
| vitest | 421 文件 / 2331 例 | **421 文件 / 2331 例 全绿** |
| e2e 管理端回归 | 106/106 | **106/106**（8 条视觉基线按设计 opt-in 跳过） |
| e2e 数据面 | 15/15 | **15/15** |

---

## 二、按门禁分的修复清单

### Floor（不可豁免，228 条全部关闭）

| 门禁 | 条数 | 修法 |
|---|---|---|
| **48** | 202 | token 块外的颜色字面量全部提升为 token：补 **29 个缺失 token**（`--app-text-tertiary/quaternary`、`--app-color-*`、`--app-on-primary`、`--app-radius-chip/full`、`--app-font-size-*`、`--app-overlay-*`、`--app-tooltip-*`、`--app-border-light/extra-light`、`--app-header-*` 度量、`--app-main-bg`、`--app-bg`、`--app-text-shadow` 等），并清掉 114 处 `var(--x, #字面量)` 兜底 |
| **26a** | 9 | 每个可交互元素补 `:focus-visible` 瞬时焦点环（无渐显，gate 15），对比度 ≥3:1 |
| **27** | 8 | 凡有 keyframes / transform 过渡处补 `@media (prefers-reduced-motion: reduce)` 兜底 |
| **62** | 3 | 过渡的初始隐藏态挂到 `.js` 作用域下（`main.ts` 加 `document.documentElement.classList.add('js')`）—— 脚本失效时内容仍可见 |
| **19** | 1 | 文案里的 em dash `—` → i18n 空值（新增 `common.none`：无 / None） |
| **30a** | 1 | emoji `▶` 当图标 → `FcIcon`（remixicon） |
| **33** | 1 | 装饰性 `<svg>` 加 `aria-hidden="true"` |
| **39a** | 1 | `FcTag` 关闭按钮的 disabled 由「只降 opacity」改为三通道（opacity + `cursor: not-allowed` + 原生 `:disabled`） |
| **67** | 1 | `.fc-cp__group-title` 的 uppercase + tracked 字距 → 正体、句首大写、不加字距 |
| **10a** | 1 | `.component-panel` 过渡 `width` → 改由 `@keyframes` 驱动 `opacity`/`translateX` |

### Reflex（68 条全部关闭，未使用任何 waive）

| 门禁 | 条数 | 修法 |
|---|---|---|
| **24b** | 53 | `padding`/`margin`/`gap` 的 px 值对齐 4px 栅格（只改 spacing 属性，不动字号/圆角/描边/宽高） |
| **26b** | 15 | 每个文件补齐 `:active` 与 `:disabled` 两态（八态里的两态缺失） |

### Warn（17 条全部确认并修掉，无一条 dismiss）

| 门禁 | 条数 | 修法 |
|---|---|---|
| **49** | 11 | 长可点击文案补 `white-space: nowrap` |
| **28a** | 2 | 首图去掉 `loading="lazy"`（`FcAvatar` / `FcImagePicker`） |
| **F6** | 2 | 数字展示补 `font-variant-numeric: tabular-nums`（`.stat-value` / `.fc-table__spinner`） |
| **29** | 1 | `FcCommandPalette` 遮罩由「半透明黑 + blur」改为品牌色调的 `--app-overlay-softer` + 2px 微模糊 |
| **F24** | 1 | `FcContextMenu` 描边下的宽软阴影改为 `--app-shadow-lg` token（16px 模糊，低于 24px 门槛） |

---

## 三、render 层（`--render`）才发现的问题

静态扫描全绿之后，用 `sloplint --render --url http://localhost:9302/login`（真实 Chrome 渲染 + 像素级测量）
跑出 **5 条 Floor FAIL**，静态层一条都看不到：

| 门禁 | 现象 | 根因 | 修法 |
|---|---|---|---|
| 26a | 登录按钮焦点环只有 1.63:1 | EP 的 `--el-button-outline-color` = `--el-color-primary-light-5`（浅蓝） | 桥接到品牌焦点环色 |
| 26a | 输入框 / 勾选框看不出键盘焦点 | EP 把焦点环画在 `.el-input__wrapper` 上（1px 内描边），且 `.el-input__inner:focus { outline: none }` 抹掉了原生焦点 | 焦点环改画在原生控件上（2px，瞬时） |
| 40 | 输入计数「0 / 50」3.08:1 | EP 用 `--el-color-info`(#909399) | 改 `--app-text-secondary` |
| 40 | 勾选态标签「记住我」2.78:1 | EP 用 `--el-color-primary`（浅蓝）作正文 | 回到正文墨色 |
| 40 | 输入框边缘 1.33:1 | EP 用 `--el-border-color`(#dcdfe6) | 新增 `--app-border-strong`(#7d828a, 3.87:1) |

### 追加的自检：全站文字对比度

render 层只能看登录页（管理后台需鉴权）。于是另写了一个扫描器，登录后遍历
7 个页面 × 明暗两套主题的所有可见文本节点，逐个算对比度：

- **改造前：48 处越线**（橙色文字 2.86:1、白字压橙底 2.86:1、语义色标签 2.4~3.2:1）
- **改造后：0 处**（余 1 处为 disabled 按钮，规范豁免）

---

## 四、token 体系：按「角色」拆色

根因是**角色混用**：品牌主色被同时拿来做「强调填充」「正文文字」「承载白字的实底」，
而 `#ff6b00` 压白卡只有 2.87:1 —— 三个角色没有一个达标。

于是把一个颜色拆成按角色的几档（同色相，只改明度）：

| token | 用途 | 取值 | 对白卡 |
|---|---|---|---|
| `--app-primary` | 品牌原色（描边、装饰填充） | 品牌值 #ff6b00 | 2.87:1（仅作装饰） |
| `--app-accent-text` | 正文/图标/链接的强调色 | 主色 × 70% + 黑 | **5.63:1** ✓ |
| `--app-primary-fill` | 承载白字的实底（按钮、分页当前项） | 主色 × 70% + 黑 | **5.63:1** ✓ |
| `--app-focus-ring` | 焦点环 | 同上 | **5.63:1** ✓（门槛 3:1） |
| `--app-border-strong` | 控件描边（输入框边缘） | #7d828a | **3.87:1** ✓（门槛 3:1） |
| `--app-color-{success,warning,danger}-text` | 语义色作正文 | 语义色 × 70% + 黑 | ≥4.6:1 ✓ |
| `--app-accent-text-on-dark` | 深色面（ldx2 的深色顶栏）上的强调文字 | 主色 × 75% + 白 | 深底 7.4:1 ✓ |

`FcTag` / `FcStatusBadge` 因此拆成「色调（`--tag-color` / `--badge-color`，用于底色与实底）」
与「文字档（`--tag-ink` / `--badge-ink`）」两个变量。

---

## 五、Element Plus 桥接层（本轮最大的结构变化）

发现两个事实：

1. **EP 的 token 与本项目的品牌层是断开的。** EP 把 token 声明在它自己 CSS 的 `:root`
   与组件类上（`.el-input` / `.el-button` / `.el-checkbox` …），而 EP 的 CSS 在打包顺序里
   排在 `theme.scss` 之后 —— 同为 `:root` 时 EP 赢。后果：EP 控件（勾选框、分页、菜单选中、
   标签页）停在 **EP 默认蓝**，与橙色品牌主调并排出现（蓝勾选框配橙按钮）。
2. **`brand-overrides` mixin 是死代码** —— 定义了但从未被任何品牌文件 `@include`，
   里面那套 EP 覆写（开关/单选/滑块/输入焦点）从未生效。

修法：在 `src/components/theme/theme.scss` 增加一层 `html:root` 桥接层
（比 EP 的 `:root` 和组件类都高一级特异性，与 import 顺序解耦），把 EP 的
主色梯度、焦点环 token、字段边缘、勾选态标签色、链接/菜单/标签页文字色
全部接到本项目的 `--app-*` 上；焦点环类规则（`.el-input__inner:focus-visible`、
`.el-checkbox:has(input:focus-visible)` 等）也放在这一层，才能压过 EP 的
`.el-input__inner:focus { outline: none }`。

---

## 六、深色主题：从「形同虚设」到「真的能用」

排查 render 层时顺带发现：**深色主题从来没生效过。**

- `theme.scss` 里 `@use '@/styles/themes'`（主题层）在前、`@use '@/styles/app-aliases'`（`:root`）在后，
  两者特异性都是 (0,1,0)，靠后的 `:root` 把 `[data-theme="dark"]` 的暗色值整个盖掉 ——
  切到 dark 后 `--app-bg-page` 仍是浅色。
- 就算盖住了，EP 自己的面板底/文字/描边 token（`--el-bg-color` 等）也不跟主题层走，
  深色下会是「白卡片 + 浅色字」。

修法：

1. `theme.scss` 里把 `@use` 顺序对调（app-aliases 在前，主题层在后）。
2. `main.ts` 引入 EP 官方暗色 token（`element-plus/theme-chalk/dark/css-vars.css`），
   并把 `theme.scss` 排到最后，让 `html:root` 桥接层压得住 `html.dark`。
3. `FcThemeProvider.applyToRoot()` 在暗色态给 `<html>` 挂上 `dark` 类，
   EP 的暗色 token 才会生效。

实测（`theme-check/` 目录有明暗双主题截图）：深色下大盘、路由列表、设置页
面板底/文字/描边全部切换到位，橙色强调色在深底上自动换成亮档。

---

## 七、其它规范内改动

- **i18n**：路由列表、用户列表、角色权限、系统设置、404 页、插件列表、大盘里的裸中文
  全部走 `t()`，中英双语同步补 key（`common.none` / `common.readonlyHint` / `common.selectAll` /
  `common.notFoundTitle|Desc|BackHome` / `role.*` / `user.empty|emptyHint` / `monitor.*`）。
- **四态覆盖**：用户列表补空态（`FcEmpty` + 「新建用户」动作，出错时不叠空态），
  新增 `data-testid="users-empty"` / `users-empty-create`。
- **Fc SDK 组件接入**：新增的 `FcIcon` / `FcRadio` / `FcCommandPalette` 等已在业务页面落地；
  `el-table-column` / `el-form` / `el-checkbox` / `el-input-number` / `el-date-picker` /
  `el-collapse` 在 Fc SDK 里没有对应组件，保留（不在 fc-web-sdk 的禁用清单内）。
- **SDK 契约零回退**：`FcFormItem` 的 required/error 语义、`FcInput` 的 attrs 拆分、
  `FcConfirm` 的 emit 顺序、`FcMain` 的三个 slot 全部保持 2026-10-30 修复后的状态。

---

## 八、证据

| 证据 | 路径 |
|---|---|
| Hallmark stamp | `gateway4j-admin-ui/src/components/theme/theme.scss` 第 1-3 行 |
| render 层截图 | `.hallmark/shots/localhost-9302-login-*.png` |
| 回归截图（120 张，9 条业务线） | `test-report/2026-11-01-05/screenshots/` |
| 明暗双主题对照 | `test-report/2026-11-01-05/theme-check/` |
| 管理端回归结果 | `test-report/2026-11-01-05/results.json` |
| 数据面回归结果 | `test-report/2026-11-01-05/gateway-data-plane-results.json` |
| 改造前截图（before 参考） | `test-report/2026-10-30-04/screenshots/` |
| pre-flight 记录 | `.hallmark/preflight.json` |

## 九、finish review（新上下文评审）结论与处置

评审在全新上下文的 subagent 里跑（只读，不改文件），结论首词是 **fix**，5 条发现全部处置：

| # | 发现 | 门禁 | 性质 | 处置 |
|---|---|---|---|---|
| 1 | **危险动作被刷成品牌橙** —— 表格里的「删除」不再是红的 | 无编号（语义色回归）+ gate 41 | 必改 | 已修：`theme.scss` 的 `html:root` 桥接层里补 `.el-button--danger.is-text/.is-link { --el-button-text-color: var(--app-color-danger-text) }`。根因是通配的 `.el-button.is-text`（0,3,1）压过了 EP 的 `.el-button--danger.is-text`（0,2,0） |
| 2 | **容器不塑形内容** —— `.fc-section` 没有内边距，内容贴卡边框（双圆角）；`FcSectionCard` 的 `width` prop 根本不存在，登录卡实测只有 255px（应 420px） | gate 4 + Finish | 必改 | 已修：① 补回 `--space-sm/md/lg` token（`FcSection` 的 padding 档位一直引用着它们，token 不存在 → 整条声明作废）；② `FcSection` 补上注释里承诺、但合 SDK 时丢掉的全局内边距（16/12/8 响应式）；③ `FcSectionCard` 增加真正的 `width` prop（数字与纯数字串按 px，纯 CSS 长度串原样） |
| 3 | **主数据断词** —— 路由列表「匹配路径」列被拆成 2~3 行，断在 token 中间 | gate 50 邻近 | 必改 | 已修：路径列加 `min-width="240" show-overflow-tooltip`；路由名 / 用户名 / 真实姓名 / 插件名列同样补 `min-width` |
| 4 | **画布缩略图是没上主题的白盒子** —— VueFlow 默认 `background:#fff` + `#e2e2e2`，比画布底还亮 | gate 81 | 建议改 | 已修：`.vue-flow__minimap` / `-node` / `-mask` / `-controls-button` 全部接到 `--app-*`；`Background pattern-color` 的 `#aaa` 字面量改成 `var(--app-text-quaternary)` |
| 5 | **375px 上壳层塌掉** —— 内容只剩 166px，表格压扁到只剩操作列，读不到一个用户名 | F25 | 建议改 | 已修：① `FcMain` 增加窄屏抽屉侧栏（`drawerOpen` prop + 遮罩 + `drawer-close`）；② `MainLayout` 把 `FcHeader` 的 `toggle-sidebar` 与 `FcSidebar` 的 `update:collapsed` 两条线都接上（之前两边都没接 —— **桌面侧栏折叠按钮也一直是失灵的**）；③ 窄屏下「更多」操作列取消 `fixed`（320px 的固定列在 375px 屏上只剩 21px 给正文），表格改为横向滚动；④ `FcPagination` 窄屏去掉 sizes / jumper（跳页框被卡片边切掉） |

顺带修掉的「token 只被采纳了一半」：

- `FcSection` 的底色/描边/阴影/过渡原本引的是 EP 的 `--el-bg-color` / `--el-border-color-extra-light`
  和三个**根本没定义**的 `--transition-base` / `--shadow-sm` / `--shadow-lg` —— 整条声明作废，
  卡片既没有过渡也没有阴影档位。全部接回 `--app-*`。
- 全仓库扫了一遍「引用了但没定义、又没有兜底值」的 token：修掉 `FcContextMenu` / `FcImagePicker`
  / `FcTabsPanel` / `FcReorderableGrid` / `FcDialog` / `FcDrawer` 里 9 处 `--radius-*`
  （`--app-radius-*` 的旧名，值从未生效）与 `FcSection` 里的 `--shadow-lg`。

---

## 十、遗留与说明

- **视觉基线套件**（`e2e-regression/visual.spec.ts`）按设计是 opt-in（`GW_VISUAL=1`），
  本轮未跑：它是逐像素比对，本轮改了配色，基线必然全红，需要时用
  `GW_VISUAL=1 npx playwright test --config=playwright.regression.config.ts --update-snapshots visual.spec.ts`
  重新生成基线。注意基线里的 `login-page-dark` / `dashboard-dark` 两张此前与 light 完全相同
  （深色主题从未生效的证据），重新生成后会是真正的深色。
- **`brand-overrides` mixin 仍是死代码**（本轮只把它想做的事在 `html:root` 桥接层里做了，
  没有去动那套历史 mixin），清理它属于重构，不在 polish 范围内。
- **`--app-text-link` 之前指向品牌原色**（2.87:1），本轮改为指向 `--app-accent-text`；
  目前项目内没有消费方，属于先把 token 契约修正。
- 结构类门禁（8/9/42/32/58 等）在 app scope 下不适用，本轮没有结构改动。
- 评审另提到三处「仍读得出机器味」的小问题，未改（记录在案）：
  侧栏九个可展开组的叶子与组同名重复（`useSidebarNavItems.ts`）、
  系统设置把「站点名称」这类短字段铺满整卡宽（表单应限宽 ~480px）、
  路由列表筛选区三个动作分三层（主操作没落在视线终点）。
  这三处都是信息架构/排布层面的调整，属结构改动，不在 polish 范围内。
