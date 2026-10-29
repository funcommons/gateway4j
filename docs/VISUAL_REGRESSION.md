# 视觉回归基线使用说明

位置：`gateway4j-admin-ui/e2e-regression/visual.spec.ts`（基线 PNG 在
`gateway4j-admin-ui/e2e-regression/visual.spec.ts-snapshots/`，随仓库提交）。

## 为什么默认跳过

截图逐像素比对对 **字体渲染 / 抗锯齿 / DPI** 极其敏感：CI runner 与本机、
macOS 与 Linux 的渲染必然存在差异。因此本套件挂了环境开关 —— **不设
`GW_VISUAL` 时整文件 skip**（nightly 回归只会多出 8 条 skipped，不会爆红）：

```ts
test.skip((process.env.GW_VISUAL ?? '') !== '1', '...')
```

## 常用命令

```bash
cd gateway4j-admin-ui

# 生成 / 比对（需要 admin-boot:9301 与 vite dev:9302 已在跑）
GW_VISUAL=1 npx playwright test --config=playwright.regression.config.ts \
  --reporter=list visual.spec.ts

# UI 有意改版后，重建基线
GW_VISUAL=1 npx playwright test --config=playwright.regression.config.ts \
  --reporter=list visual.spec.ts --update-snapshots
```

`--reporter=list` 是刻意的：CLI 传 reporter 会整体覆盖 config 的 reporters，
避免这 8 条用例的结果覆盖 `test-report/` 下全量回归的 `results.json`。

## 何时比对 / 何时更新

- **比对**：任何涉及模板、样式、主题（`FcThemeProvider` / brands）、组件库
  升级的改动，本地跑一轮看 diff；失败时看
  `test-results/**-actual.png / -expected.png / -diff.png` 三联图。
- **更新**：确认 diff 是「有意的设计变更」后，加 `--update-snapshots` 重建，
  并把新基线随改动一起提交。**不允许**把红着比对当基线重建的借口 ——
  先肉眼确认三联图再重建。

## 覆盖的 8 个关键态

| 基线 | 页面 | 主题 |
|---|---|---|
| login-page-light | 登录页 | light |
| routes-list-light | 路由列表 | light |
| dashboard-light | 监控大盘 | light |
| route-canvas-light | 路由编排画布 | light |
| builtin-plugins-light | 内置插件卡片 | light |
| settings-light | 系统设置 | light |
| login-page-dark | 登录页 | dark |
| dashboard-dark | 监控大盘 | dark |

dark 态通过 `addInitScript` 预写 `fc-theme-provider` 的 localStorage
（`{"v":1,"brand":"ldx2","theme":"dark"}`）实现 —— `FcThemeProvider` 在
setup 阶段同步恢复，无首屏闪烁，不依赖手点外观按钮。

## 稳定性设计（读一遍再改）

- **动画/光标**：`animations: 'disabled'` + `caret: 'hide'`，截图前等
  networkidle + 800ms；画布额外多等 1.5s（Vue Flow 首帧 JS 动画）。
- **活数据区域一律 mask**（共享演示库里并行测试会持续增删数据）：
  - 大盘：统计卡数值、指标卡数值、趋势图 canvas、最近刷新时间、路由选择器；
  - 路由列表：`.el-table__body-wrapper`（保留工具栏/表头/分页做版式门禁）；
  - 内置插件：`.runtime-stats`（实时 QPS 计数器）；
  - 另配 `maxDiffPixelRatio` 小容差（0.01~0.02）吸收亚像素噪声。
- **基线文件带平台后缀**（`-chromium-darwin.png`）：默认
  snapshotPathTemplate 的产物，macOS 与 Linux 基线互不干扰、可共存提交。
  目前基线只在本地 macOS chromium 维护；若要在 Linux CI 比对，需先在
  Linux 容器生成 `-linux` 基线再纳入。

## 已知边界

- 页面语言跟随应用默认（zh-CN）；spec 里显式固定了 `locale: 'zh-CN'`。
- 基线是「环境快照」：换机器 / 换显示器缩放 / element-plus 升级后首跑会红，
  属预期 —— 肉眼确认无回归后 `--update-snapshots` 重建即可。
