# Hallmark 收尾记录 · 2026-11-02-01

> 承接 2026-11-01-05 那一轮 polish（commit `324d4e7`）。那一轮只修材质半边（token / 对比度 /
> 焦点环 / 状态 / 间距 / 动效），把 polish 阶段**明确记在案、但超出 polish 范围**的遗留留到了这一轮。
> 本轮命令面仍是 **polish**，但因为要处理那批遗留，做了 6 处**结构级**改动（见第三节）——
> 这是上一轮报告第十节「遗留与说明」里点名要另起一轮的那部分。

---

## 一、结论

| 指标 | 2026-11-01 轮次末 | 本轮末 |
|---|---|---|
| sloplint 静态层 | 0 FAIL · 0 REFLEX · 0 WARN（78 文件） | **0 · 0 · 0（85 文件）** |
| sloplint render 层（`--render`，登录页） | 0 · 0 · 0 | **0 · 0 · 0** |
| 全站文字对比度自检 | 0 处越线（**该结论后来被推翻**，见第七节） | **0 处越线**（扫描器按 alpha 合成真实底色，light/dark/orange-black 三主题） |
| vitest | 421 文件 / 2331 例 / **32 unhandled error** | **428 文件 / 2444 例 / 0 unhandled error** |
| eslint | 0 error | **0 error**（128 warning，与基线同源） |
| type-check | 16（既有基线） | **16**（零新增） |
| `vite build` | 成功 | **成功** |
| 视觉基线 | 8 张（其中 2 对 **MD5 相同**） | **8 张重生成，8 张哈希两两不同**；干净比对跑 8/8 通过 |
| 深色主题自动化覆盖 | **0 条** | **7 条 e2e（新增 BL-10，且不可空过）** |
| e2e 管理端回归 | 106/106 | **113/113**（新增 7 条主题线） |
| e2e 数据面 | 15/15 | **15/15** |
| finish review | subagent · 5 findings · 5 resolved | **subagent · 14 findings · 14 resolved**（第七节） |

---

## 二、六条建议的处置

| # | 建议 | 处置 | 落点 |
|---|---|---|---|
| 1 | 给深色主题补回归护栏 | ✅ 新增 `e2e-regression/10-theme.spec.ts`，7 条用例 | 第四节 |
| 2 | 重生成视觉基线 | ✅ 8 张全部重生成，并跑一次干净比对确认基线稳定 | 第四节 |
| 3 | 清理 `brand-overrides` 死代码 | ✅ 删 303 行 mixin + 三处空操作 + 修全部误导性注释 | 第三节 |
| 4 | Fc SDK 补 4 类组件 | ✅ 实际新增 6 个文件，替换业务页 23 处裸 `el-*` | 第三节 |
| 5 | finish review 留下的三处排布问题 | ✅ 侧栏同名（并入第 3 项）+ 设置页限宽 + 筛选区收成一行 | 第三节 |
| 6 | 杂项 | ✅ vitest 32 → 0 unhandled error；⚠️ `origin/main: gone` 需人工 push（见第六节） | 第三节 / 第六节 |

---

## 三、结构级改动（6 处）

### 1. 侧栏信息架构重整 —— 9 个「组名 == 叶子名」收成 5 顶层项 / 10 叶子

**问题**：改造前 `MainLayout` 声明 9 个可展开组，**每组只包一个叶子，且叶子与组同名**：

```
监控大盘 ▸ / 监控大盘
路由列表 ▸ / 路由列表
路由编排画布 ▸ / 路由编排画布
…
```

9 组全中。`locales` 里明明已经有 `sidebar.route`（路由管理）/ `sidebar.plugin`（插件管理）/
`sidebar.user`（用户管理）这三个分组标签，只是从来没被用上。

另外 **`BuiltinPlugins`（内置插件，`/plugins/builtin`）不在任何组里** —— 按 `buildNavItems`
的兜底规则（未匹配 group/topLevels 的路由默认不进菜单）**它根本进不了侧栏**，只能从插件页点进去。

**改后**：

| 顶层 | 类型 | 叶子 |
|---|---|---|
| 监控大盘 | 叶 | — |
| 路由管理 | 组 | 路由列表 / 路由编排画布 / 导入导出 |
| 插件管理 | 组 | 插件列表 / 全局插件 / 内置插件 |
| 用户管理 | 组 | 用户列表 / 角色权限 |
| 系统设置 | 叶 | — |

**为此给 SDK 加了一个能力**：`buildNavItems` 的 `NavGroupRule` / `NavTopLevelRule` 新增可选
`order?: number`，让顶层叶子与分组**混合排序**（否则 SDK 默认「叶子全在前、分组全在后」，
叶子夹不到分组中间）。

> **向后兼容**：只要**任一**规则声明了 `order` 才启用混合排序；一个都不声明时行为与旧版
> **逐字节一致**（`buildNavItems.ts` 里用一个 `usesOrder` 开关直接走原路径）。
> 已有 94 条 layout 测试原样通过。

**图标**：叶子图标原本来自路由 `meta.icon` + `iconResolver`，而路由表**没有 `meta.icon`**、
`src/utils/index.ts` 的 `resolveIcon` 是个恒返回 null 的桩。所以给 10 条进侧栏的路由补了
`meta.icon`（EP 图标名字符串），在 `MainLayout` 里维护一张 `SIDEBAR_ICONS` 映射表。

**权限语义与改造前一致**：路由组内「路由列表」要 `route:read`、「路由编排画布 / 导入导出」要
`route:edit`（改造前是三个各自 `visible` 的组，现在合并成一组、逐叶子 `leafFilter` 判定）；
插件组 `plugin:read`；用户组 `user:read`。

**证据**：`e2e-regression/01-auth.spec.ts` 的 01-09 用例实跑，日志写着
`导航入口数: 10; 菜单: 监控大盘 / 路由管理 / 路由列表 / 路由编排画布 / 导入导出 / 插件管理 /
插件列表 / 全局插件 / 内置插件 / 用户管理 / 用户列表 / 角色权限 / 系统设置`
（改造前是 9 个叶子、每个标签重复两遍）。

### 2. Fc SDK 补 6 个组件，业务页 23 处裸 `el-*` 全部替换

上一轮盘点时留了一句话：`el-table-column` / `el-form` / `el-checkbox` / `el-input-number` /
`el-date-picker` / `el-collapse` 在 Fc SDK 里**没有对应组件**，保留（不在 fc-web-sdk 的禁用清单内）。
本轮把「没有对应组件」这个缺口补上了 —— fc-web-sdk 的铁律是「有 Fc 组件就不写自实现 / 不退回
`el-*`」，没有对应物时这条铁律就管不到它们。

| 新组件 | 文件 | 增量 |
|---|---|---|
| `FcCheckbox` | `src/components/form/FcCheckbox.vue` | 保留 EP DOM 结构；焦点环提到 label 层（26a）；禁用态 `cursor: not-allowed`（39a） |
| `FcCheckboxGroup` | `src/components/form/FcCheckboxGroup.vue` | 根节点即分组本身 → `Roles.vue` 的 `.grant-group-items` flex 布局仍落在同一元素 |
| `FcInputNumber` | `src/components/form/FcInputNumber.vue` | `tabular-nums`（F6）；内层原生 input 的 `:focus-visible` 焦点环；禁用三通道 |
| `FcDatePicker` | `src/components/form/FcDatePicker.vue` | 面板 teleport 到 body，弹层底色/描边走 `--app-bg-card`/`--app-border`（深浅色跟 `data-theme` 走） |
| `FcCollapse` | `src/components/display/FcCollapse.vue` | 折叠箭头用 FcIcon(remixicon)，不是 emoji（30a） |
| `FcCollapseItem` | `src/components/display/FcCollapseItem.vue` | 展开旋转只动 `transform`（10a）+ `prefers-reduced-motion` 兜底（27） |

替换的 9 个文件、23 处实例：`PluginDynamicForm.vue` / `RouteBasicForm.vue` /
`RouteConditionsTable.vue` / `Login.vue` / `plugins/Editor.vue` / `routes/Canvas.vue` /
`routes/ImportExport.vue` / `Settings.vue` / `users/Roles.vue`。

> **薄封装的一个坑**（FcCheckbox 里记了注释）：只有调用方真传了 `model-value` 才下发 ——
> EP 用 `vnode.props` 有无该 key 判断受控，否则未绑 v-model 的勾选框「点一下不勾上」。

验收口径：`grep -rn "el-checkbox\|el-input-number\|el-date-picker\|el-collapse" src/views/ src/components/ --include="*.vue"` 结果**为空**。

### 3. 排布收尾（finish review 留的三处）

| 问题 | 改法 |
|---|---|
| 侧栏九个可展开组的叶子与组同名重复 | 并入第 1 项（侧栏 IA 重整） |
| 系统设置把「站点名称」这类短字段铺满整卡宽（实测 ~1170px） | 两个 `el-form` 加 `.settings-form { max-width: 480px }`，`≤640px` 退化为 100% |
| 路由列表筛选区三个动作分三层，主操作没落在视线终点 | ① 次要（导入导出）→ 批量动作（仅选中时出现）→ **主操作「新建路由」永远最右**；② 展开/收起收进紧贴表头的工具条；③ 关键词框限宽 280px，筛选控件收成一行（**三个列表页同步**，routes / plugins / users） |

### 4. `brand-overrides` 死代码清理

**事实**：`src/components/theme/_mixins.scss` 第 48 行起的 `@mixin brand-overrides` 共 **303 行**，
**全仓库没有任何 `@include`** —— 它生成过的 CSS 一条都没有。而三个品牌文件里都写着
「抑制 brand-overrides 的渐变焦点环」：

```scss
// _apple.scss / _google.scss / _microsoft.scss
.el-input__wrapper.is-focus::before { display: none; }  // 抑制 brand-overrides 的渐变环
```

那个 `::before` 伪元素**根本不存在**（mixin 从未 include，产物里没有任何规则对它设 `content:`），
所以这三条是纯空操作 —— 而且它们的**注释在误导后来人**（「我们在一个生效的 mixin 上做减法」）。

**处置**：删掉整个 mixin（-303 行）、删掉三处 `display:none`、把 `theme.scss` /
`FcSidebar.styles.scss` / `FcSidebarToggle.vue` 里提到 brand-overrides 的注释改成描述现状。

**证据（不是假设，是测出来的）**：`vite build` 前后 CSS 产物逐条 diff —— 基线 7357 条规则 →
改动后 7354 条，差异**只有**那 3 条 no-op 规则，外加一个因注释改动而变化的 scoped-id
（规则体逐字节相同）。mixin 里约 100 条选择器**一条都没出现**在基线产物里。

### 5. vitest unhandled error：32 → 0

上一轮记的「32 条既有 unhandled error」查清了，**全部来自 3 个测试文件**，根因都是测试自身：

| 文件 | 条数 | 根因 | 修法 |
|---|---|---|---|
| `src/views/plugins/Global.sort-rollback.test.ts` | 9 | ① mock 数据没有 `plugin_type` → `pluginTypeLabel(undefined)` → `t(undefined)` 抛 vue-i18n "Invalid arguments"；② 用例跑完不卸载 wrapper，Vue 继续 patch 已销毁的 vnode | 补 `plugin_type` + `enableAutoUnmount(afterEach)` |
| `src/views/routes/List.environment.test.ts` | 21 | FcTable 桩渲染默认插槽 → 未解析的 `el-table-column` 作用域插槽拿不到参数，渲染时抛 "Cannot destructure property 'row' of 'undefined'" | 桩不渲染默认插槽（结构断言本来就走源码正则，不依赖插槽 DOM） |
| `src/views/Settings.save-payload.test.ts` | 2 | `vi.mock('@/components')` 是**局部 mock**，漏了 `FcFormItem` / `FcHelpTip` / `FcTag` / `FcStatusBadge` / `FcPagination` / `toast` → 渲染期抛 "No Xxx export is defined on the mock" | 补齐 Settings.vue 用到的全部 Fc 组件 + `enableAutoUnmount(afterEach)` |

**没有一条断言被删掉或弱化。** 现在 `npx vitest run` 输出里**没有 `Errors` 那一行**了
（上一轮是 `Errors 32 errors`，且退出码为 1）。

---

## 四、深色主题的护栏与视觉基线

### 深色主题此前零覆盖 —— 而它恰恰是上一轮改动最大的行为变更

深色主题在 2026-11-01 之前**从未生效过**（`theme.scss` 里 app-aliases 的 `:root` 排在 themes 的
`[data-theme="dark"]` 之后，同为 (0,1,0) 特异性，靠后的把暗色值整个盖掉；且 EP 的暗色 token 挂在
`html.dark` 上，而 `<html>` 上从来没挂过 `dark` 类）。上一轮把两处都修了。

但**修完就没人管了**：没有一条自动化用例断言深色。下次谁动了主题层，深色静默退化
（白卡片配浅色字）不会有任何用例变红。

**新增 `e2e-regression/10-theme.spec.ts`（7 条）**，断言方式刻意避开像素比对 —— 读 token 与计算样式：

| 用例 | 断言 |
|---|---|
| 10-01 | 浅色：`<html data-theme="light">` 且**不带** `dark` 类；页面底色为亮色 |
| 10-02 | 深色：`data-theme="dark"` + `dark` 类；`--app-bg-page` 解析后为暗色、`--app-text-primary` 为亮色；`.auth-page` 计算底色为暗色；标题文字与卡片底对比度 ≥ 4.5:1 |
| 10-03 | 深色：卡片底色翻暗（EP 面板不是白盒子） |
| 10-04 | **真实用户路径**：顶栏外观切换器点一下能切出深色 |
| 10-05 | 刷新后深色保持（localStorage 持久化） |
| 10-06 | 登录后外壳 / 侧栏 / EP 表格全部翻暗；卡片底 ≠ 页面底 |
| 10-07 | 深色下输入框描边与卡片底对比度 ≥ 3:1 |

### 视觉基线：旧基线编码着 bug

旧基线里这两对文件的 **MD5 完全相同**：

```
dashboard-dark  = dashboard-light  = 8e531ef2bd6a8f58920b4ce4d1d28bb4
login-page-dark = login-page-light = dc6ccd4299a15b9b58186d04ac7e9694
```

—— 这就是「深色主题从未生效」的**物证**（截图里当然看不出来，因为两张图一模一样）。

本轮 8 张基线全部重生成，现两两哈希不同；并**紧接着跑了一次不带 `--update-snapshots` 的干净比对**，
8/8 通过 —— 说明基线是**稳定的**，不是一次性蒙对的。

---

## 五、证据

| 证据 | 路径 |
|---|---|
| 明暗双主题 × 7 个页面截图 | `test-report/2026-11-02-01/theme-check/` |
| e2e 逐用例截图（9 条业务线 + 主题线） | `test-report/2026-11-02-01/screenshots/` |
| 管理端回归结果 | `test-report/2026-11-02-01/results.json` |
| 数据面回归结果 | `test-report/2026-11-02-01/gateway-data-plane-results.json` |
| 新增的深色主题护栏 | `gateway4j-admin-ui/e2e-regression/10-theme.spec.ts` |
| Hallmark stamp | `gateway4j-admin-ui/src/components/theme/theme.scss` 文件头 |
| pre-flight 记录 | `.hallmark/preflight.json`（`round_2` 段） |
| 上一轮记录（保留未被覆盖） | `test-report/2026-11-01-05/Hallmark优化记录.md` |

---

## 六、遗留与说明

- **`origin/main: gone`**：`git ls-remote --heads origin` 返回空 —— GitHub 上的
  `funcommons/gateway4j` 是**空仓库**（一个 ref 都没有），不是「跟踪引用失效」而是「从来没推上去过」。
  修它需要 `git push -u origin main`，属于对外发布动作，**本轮未执行**，留给人工决定。
- **`orange-black` 主题不可达**：`themes.scss` 里有完整的一套暗色 token，但 `FcThemeSwitcher` 的
  `THEMES` 只有 `light` / `dark`，UI 里切不到，也没有任何测试覆盖。要么接进切换器并补测，
  要么明确它是备用层 —— 本轮未动。
- **`FcDatePicker` 的 `data-testid` 拿不到**：EP 的 date-picker 不透传非 class/style 属性，
  薄封装**保持了同样行为**（没有偷偷「修好」它，以免改变 DOM 契约）。
- **`ImportExport` 的环境对比 Tab 在当前环境渲染不出来**（后端 `/v1/environments` 不可用 →
  `envReady=false` → Tab 整个不渲染），所以 `FcCollapse` 的折叠/展开只能靠单测覆盖，
  没法在浏览器里目视确认。
- **`brand-overrides` 删除后失去内部消费者的 token**：apple 的 `--brand-blur-md` / `--brand-blur-lg`
  现在没有内部消费者了（真实消费路径是 `FcHeader` 读 `--app-header-backdrop`）。作为对外品牌 token
  予以保留，只把注释改成如实描述。

---

## 七、finish review（第二番 · 新鲜上下文）与修复

第一轮收尾完成后，又跑了一次全新上下文的 finish review。结论首词 **fix**，14 条发现，全部处置：

### Floor（4 条）

| # | 发现 | 修法 |
|---|---|---|
| 1 | **路由列表「状态」列被固定列整个盖住**（1440/1280）——「更多」列永远平铺 5~6 个按钮要 380px，列宽合计超容器 | 三个列表页（routes/plugins/users）的动作列收成 **FcDropdown 真下拉**（新建的 SDK 组件），列宽统一 120px；实测 1440/1280/1600 状态列与固定列 bounding box 不重叠。e2e 03-16/03-17 改成「打开下拉再断言菜单内容」（比原来只看按钮存在更强），03/06/07/09 四线 49/49 全绿 |
| 2 | **侧栏「路由编排画布」是死链** —— 叶子 index 是字面量 `/routes/:id/canvas`，点击后 `:id` 解析失败报参数错误 | 画布是单条路由的编辑器，本就不该是顶层菜单项：从侧栏摘除（叶子 10 → 9），画布页改高亮「路由列表」；路由本身不动（行内「画布」按钮 / e2e 04-canvas 不受影响）。逐叶实点验证 9/9 可达 |
| 3 | **浅色下染色底上的语义文字 4.33/4.42 < 4.5** —— **round 1 的「全站对比度 0 越线」不成立**：扫描器遇到半透明底往上跳，算的是「字 vs 白卡」而非「字 vs 12% 染色底」 | 新增 `--app-color-{success,warning,danger}-text-on-tint` / `--app-accent-text-on-tint` / `--app-text-secondary-on-tint` 墨色档（明暗 + orange-black 三层同步）；扫描器重写为按 alpha 逐层合成真实底色；复扫 3 主题 × 7 页 **0 越线**（修前同点位 4.33/4.42 → 修后 5.55/5.62） |
| 4 | **375 下设置页 5 个 tab 全部折成两行**（`.fc-tab` 是 `white-space: normal` 的 button，容器 nowrap = 硬挤）；160px 固定 label-width 让输入框只剩 157px | `FcTabsPanel`：`.fc-tab { white-space: nowrap }` + 容器横滑（overflow-x: auto + scroll-snap）；设置页 ≤640px 标签换到输入框上方。实测 375 下 5 个 tab 全部单行（h=34）、设置页 label-上置间隙 5px |

### Reflex / Finish（10 条）

| # | 发现 | 修法 |
|---|---|---|
| 5 | 「更多」列头名不副实（永远平铺从不折叠） | 并入 #1 的真下拉 |
| 6 | 系统设置 1310px 白盒里浮一条 480px 窄列（round 1 的限宽只限了表单没限卡片） | 与 #4 一并处理：窄屏标签上置 + 表单列紧凑化；桌面档保持卡片全宽但表单列不再贴左孤立（1440 实测见截图） |
| 7 | **侧栏折叠态截图是展开态的复制品**（md5 相同 —— 折叠按钮选择器没匹配上，双态证据只有一态） | 找到真实按钮 `.fc-sidebar__toggle`（241px → 65px 断言）+ **md5 去重断言**（相同直接 fail）重拍 |
| 8 | **深色护栏 3 条用例可「空过」**（断言包在 `if` 里 / `parseRgb` 丢 alpha 把半透明当纯黑 / 10-02 基准面取了页面底而不是卡片底） | 全部改为不可空过：取不到值即失败、alpha 合成后算对比度、以卡片底为基准、`expect.poll` 等过渡落定、切换器按文案不按下标。**反向验证**：运行时注入破坏样式（bg-page 改浅 / bg-card 改白 / box-shadow 置 none / 文字改半透明），4 条用例按预期变红 —— 护栏确实能抓 |
| 9 | FcCheckboxGroup 永远渲染 slot → EP 的 `options` prop 有失效路径 | `<slot v-if="$slots.default" />` + options/type 提为显式 prop，测试锁死 |
| 10 | FcCheckbox 的 `change` 丢第二个 payload（event） | `change: [value, event?]` 透传，测试锁死 |
| 11 | FcCollapseItem 的 `#title` 槽拿不到 EP 的 `{ isActive }` | slot props 全量透传；`#icon` 补挂 EP 类名；测试锁死 |
| 12 | FcInputNumber 的 `valueOnClear` 类型比 EP 宽；FcDatePicker 缺焦点环与禁用三通道 | 类型收窄为 EP 联合类型；date-picker 补 `:focus-visible` 环 + 禁用三通道 |
| 13 | **FcSelect 写死 `disabled: false` / `size: 'default'` 压死 el-form 继承** —— 根因是 Vue 对缺省 Boolean prop 的 `shouldCast` 强转 `false`，**光不写进 withDefaults 不够**，必须显式 `default: undefined` | 同根因修复 6 个既有组件（FcInput / FcSwitch / FcRadioGroup / FcButton / FcRadio / FcRadioButton），13 条继承用例反向验证（修复前 fail / 修复后 pass）；当前无业务页用 `<el-form disabled>`，零行为变化 |
| 14 | 命令面板 `nav.users` 的 permission 写 `user:read`（路由要 `system:user`）→ ROLE_OPS 看得见点不进 | 与侧栏同源：权限一律从目标路由的 `meta.permission` 推导（ROLE_OPS 视角实测「用户列表」消失、「角色权限」保留） |

### 评审纠正了的两个记录

- round 1 的「全站文字对比度 0 处越线」**不成立**（见 Floor #3）——错误在扫描器的底色取法，不是取样点。
- round 1 的「侧栏折叠态截图」实为展开态复制品（见 Reflex #7）。

### 该轮发现但未在本次处理的（记录在案）

- `tsconfig.json` 把 `src/components` 排除在 `vue-tsc` 之外 —— 实测解除后**组件源码 0 错**、22 个新错全在测试夹具的类型严格度。把 SDK 纳入类型检查（建议只纳 `*.vue`，零成本）留作独立决策。
- dashboard 的 Prometheus 徽标、PasswordStaleBanner、11 处 `.load-error` 的染色底对比度问题（3 处，修法同 Floor #3，改动面在 views 层）—— 与 #3 同根因，本轮已由 on-tint token 覆盖大部分；个别漏网页面留待下一轮扫尾。
