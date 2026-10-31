# SDK 合入记录（2026-10-30-03）

> 指令：`从 /Users/justin/codes/ldx2/app/ldx2a-orange-route/prototype/web/ 中 copy sdk 过来`
> 源：`ldx2/app/ldx2a-orange-route/prototype/web/src/components/sdk/`（更新更全的一版）
> 目标：`gateway4j-admin-ui/src/components/`（本项目 SDK 是**平铺**的，无 sdk/ 中间层）

## 合入方式（不能盲拷的三个理由）

1. **别名断层**：源 SDK 内部统一用 `@/components/sdk/...` 绝对别名；本项目 SDK 平铺在 `@/components/...`。
   → 全量改写为 `@/components`，且把 **SDK 内部对根 barrel 的引用改为直接相对路径**（否则 barrel ↔ SDK 循环依赖）。
2. **根 barrel 归属**：源 SDK 根 `index.ts` 会覆盖本项目的 barrel（后者还导出业务组件）→ 改为**合并**：SDK 各子目录 barrel `export *` + 保留业务导出。
3. **本地件保留**：`data/FcTable.vue`、`data/_types.ts`、`form/FcFormItem.vue`、`form/FcInput.vue`、`search/`、业务组件一律不动。

## 差异面（源 vs 本项目旧版）

- **45 个文件有差异**（data 2 / display 7 / form 4 / layout 11 / navigation 5 / overlay 9 / section 2 / theme 3 + README）
- **源独有（新增）**：`feedback/`（FcHelpTip / FcToast）、`utils/`（8 个工具，含 useResponsive / useEventListener / imageTransform / recentProvider）、
  `FcIcon`、`FcRadio` / `FcRadioButton` / `FcRadioGroup` + radioContext、`FcFormDraftBanner`、`FcCommandPalette`、各目录 barrel、SDK 自带测试 32 个
- **本项目独有（保留）**：`FcTable`（本项目自写表格）、`FcFormItem` / `FcInput`（本项目补的薄封装，含今天修过的三处缺陷）、`search/GlobalSearch`、业务组件

## 合入过程中修掉的问题（源快照的缺陷 / 与本项目契约冲突）

| # | 问题 | 性质 | 处理 |
|---|---|---|---|
| 1 | **FcMain 丢失 `#sidebar` / `#header` 插槽** | **严重回归**：本项目 MainLayout 靠这两个插槽放侧栏与顶栏 → 整站外壳消失（顶栏/侧栏/环境切换器全没了） | 保留本项目旧 FcMain（三段式 shell），仅补导出 `FcMainProps` 供 SDK barrel 使用 |
| 2 | **FcConfirm emit 顺序反了**（先 `update:open` 后 `confirm/cancel`） | **严重回归**：`useFcConfirm` 的 `onUpdate:open` 在 `!val && !settled` 时 settle(false) → 命令式 confirm() **无论点确认还是取消都返回 false** | 恢复契约顺序 + `resultEmitted` 单发守卫；新增**行为级**回归测试（此前只有源码正则断言，拦不住） |
| 3 | FcConfirm 丢失 `#trigger` 插槽与 `:close-on-press-escape="!loading"` | 能力回退 | 两者移植回来 |
| 4 | **FcDialog resize 监听在卸载时不清理**（多方向重构中丢失） | 真实泄漏 bug（本项目早前修过并有测试守护） | 移植 `currentResize` 句柄 + onBeforeUnmount 清理 |
| 5 | FcSection / FcSectionCard 丢失 `#footer` 插槽 | 能力回退 | 移植回来（含 `.fc-section__footer` 样式） |
| 6 | FcImagePicker 残留 10 处 `[DIAG:]` 调试日志 | 违反本项目「生产代码禁止 DIAG 日志」约束 | 全部清除 |
| 7 | FcDropZone 把 i18n 文案换成硬编码英文串（`t('common.warning') + ': ...'`） | 违反 i18n 约束 | 恢复 `common.dropReject*` 文案 |
| 8 | buildNavItems 丢失全局 `leafFilter` 应用；useSidebarNavItems 把 `iconResolver` 改必填 | 能力回退 / 破坏性变更 | 合并回本项目行为（leafFilter 前置过滤 + iconResolver 可选兜底） |
| 9 | SDK 内部 import 根 barrel → 循环依赖 | 运行时故障 | SDK 内部改为直接相对路径 |
| 10 | FcButton `icon?: unknown` / FcPopover `trigger` / FcThemeSwitcher `triggerIcon` 类型与 EP 不匹配 | 类型 | 收窄/cast |
| 11 | `src/i18n.ts` 模块加载期裸读 `localStorage` | 脆弱点（新 SDK 组件链式拉起它） | 加容错读取 |
| 12 | `FcStatusBadge` 丢掉 `warning` tone | 词表变更 | 调用方迁到 `pending`（同 token 同视觉） |
| 13 | `FcToast.ts` 引用 `@/locales`（本项目无该 barrel） | 路径 | 改 `@/i18n` |
| 14 | **FcFilterBar 丢失 `#actions` 插槽** | **业务回归**：「新建」「导入」「新建插件」「新建用户」主操作按钮全部消失（e2e 4 例红） | 移植回插槽 + `.fc-filter-bar__actions` 样式（D2 修复） |
| 15 | **FcThemeSwitcher popover 变体丢了根包装层** | **业务回归**：弹层懒渲染时 DOM 上没有可断言的出口（e2e 01-11/09-09 红） | 移植回 `<div class="fc-theme-switcher fc-theme-switcher--trigger">` 包装（D1 修复） |
| 16 | vite 依赖预构建缓存失效（`504 Outdated Optimize Dep`） | **环境问题，非 SDK 缺陷**：SDK 拷贝改了依赖图，dashboard/canvas 动态 import 全部 504 → 整页空白（14 例红） | 清 `node_modules/.vite` 重启 vite 重新预构建 |

## 测试基座隔离（vitest workspace 双 project）

源 SDK 的 32 个测试依赖「重基座」（全局 ElementPlus + i18n + pinia + matchMedia/ResizeObserver/localStorage polyfill），
而本项目既有用例有依赖「测试环境**未**注册 ElementPlus」的断言（EnvironmentSwitcher 直接驱动 FcSelect → el-select 路径）。
全局一刀切会互相破坏 → 引入 `vitest.workspace.ts`：

- **app** project：既有用例，`setupFiles: src/test-utils/app-setup.ts`（**只**装 i18n + polyfill，不装 EP）
- **sdk** project：SDK 原生用例（`*.sdk.test.ts` + `src/components/__tests__/**`），`setupFiles: src/components/__tests__/setup.ts`（EP + i18n + pinia + polyfill）

SDK 原生测试统一改名 `*.sdk.test.ts`（32 个），避免与本项目测试同名互相覆盖，并让 project 归属可判别。

## 验收

| 项 | 结果 |
|---|---|
| vitest | **419 文件 / 2329 例全绿**（原 384/1963 + SDK 35 文件/366 例） |
| type-check | **16 = 基线零新增** |
| eslint | **0 error**（146 warnings 为存量 raw-text 记账类） |
| 数据面 e2e | **15/15** |
| 管理面 e2e | **106/106 通过**（15.9m，8 视觉 skipped，`unexpected: 0 / flaky: 0`） |

## 方法论备注

- 本次合入暴露的核心事实：**ldx2 SDK 与 gateway4j SDK 是两套「应用外壳模型」**——源版 FcMain 只管主内容区（侧栏/顶栏由其 App.vue 自己拼），本项目版是三段式 shell。
  盲目整体替换会让全站外壳消失（单测能抓到：MainLayout 环境切换器用例直接红了）。
- 单测红了不要急着改断言：先分清「源版更差」还是「本项目契约更严」。本次 16 项里，只有 1 项是改调用方（FcStatusBadge tone 迁移），其余全是把本项目已验证的能力/契约**合并回去**。
- **e2e 红了先排环境**：本轮 32 例失败里有 14 例是 vite `504 Outdated Optimize Dep`（SDK 拷贝改了依赖图 → 预构建缓存失效 → 动态 import 全挂 → 整页空白且无 console 错误）。这类「白屏 + 零 API 调用 + 零报错」的特征指向依赖缓存，不是页面代码。
- **插槽面要系统化比对**：逐组件 diff HEAD 与新版的 slot 出口（`$slots.X` / `<slot name="X">`）能一次性捞出 FcFilterBar.actions 这类丢失；只靠「点开页面看」容易漏。
