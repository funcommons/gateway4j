# README-CI —— CI 设计与本地运行方式

## 总览

| 文件 | 作用 |
|---|---|
| `.github/workflows/ci.yml` | PR / main 推送门槛：前端（type-check + Vitest 1681 例）、后端（`gateway4j-admin -am` 单测 96 例）、护栏（权限码 + 接口契约）三个独立 job |
| `.github/workflows/nightly-regression.yml` | 每日全量回归：UTC 18:35（北京时间次日 02:35）定时 + 手动触发，pg17/redis7 service 容器 + 后端 jar + vite dev + Playwright 回归矩阵 108 条（`--list` 收集 116：默认跑 108，视觉基线 8 条 `GW_VISUAL=1` 门控默认跳过；v2 迁移 c 类裁减 6 条仅注释留痕不收集，2026-11-09 P4e 实测） |
| `scripts/check-permissions.mjs` | 权限码差集护栏（防 D5 复发） |
| `scripts/check-api-contract.mjs` | 接口契约护栏（防 D3/D4/D19 复发） |

两个护栏脚本均为纯 Node ESM、零三方依赖；内部用 `import.meta.url` 定位仓库根，
**在任意 cwd 下均可直接运行**。

## 触发与并发

- **ci.yml**：`pull_request` 与 `push: [main]`，按前端/后端模块、`pom.xml`、`scripts/**` 过滤路径；`concurrency.group = ci-<workflow>-<ref>`，新推送自动取消旧运行。
- **nightly-regression.yml**：`schedule: 35 18 * * *`（UTC）+ `workflow_dispatch`；`concurrency.group = nightly-regression` 且不取消进行中的运行（回归宁可排队不可拦腰砍）。

## 护栏脚本说明

### check-permissions.mjs（权限码差集）

- **前端来源**：`gateway4j-admin-ui/src/**`（排除 `*.test.ts` 测试桩）中的
  `canEdit('X')`（解析为 `X:edit`，与 `usePermission.ts` 行为一致）、
  `hasPermission('X')`、`hasAnyPermission('X','Y')`、路由 meta `permission: 'X'`
  （只接受 `seg:seg` 形态，自动过滤 locales 里的 i18n 文案）。
- **后端来源**：`db/migration/*.sql` 中 `INSERT INTO gw_permission` 语句的 VALUES
  元组首列（兼容 V1.0.0 多行 VALUES 与 V1.2.1 的 `INSERT...SELECT...(VALUES...)`）。
- **判定**：前端引用 − SQL 声明 ≠ ∅ → 逐码打印引用位置 → `exit 1`；
  SQL 声明了但前端未引用 → 仅打印 info。
- 无法静态解析的动态调用（模板字符串/变量）会计数提醒（`usePermission.ts`
  自身的实现不计入）。

### check-api-contract.mjs（接口契约）

- **前端来源**：`src/api/*.ts`（排除 `*.test.ts`）的 `http.get/post/put/patch/delete('...')`，
  模板字符串 `${id}` → `{id}`。
- **后端来源**：`gateway4j-admin` 下所有 `*Controller.java` 的类级
  `@RequestMapping("X")` + 方法级 `@GetMapping/...("Y")`（无值视为空串，
  支持 `value = "/x", consumes = ...` 形态），路径变量统一归一为 `{id}`。
- **判定**：前端调用找不到「同方法 + 同路径」→ 打印缺失及文件行号 → `exit 1`；
  后端有、前端未调用 → 仅打印 info。

## 本地运行

```bash
# ── 护栏（零依赖，任意目录）──
cd gateway4j-admin-ui && npm run check:permissions   # 或 node scripts/check-permissions.mjs
cd gateway4j-admin-ui && npm run check:contract      # 或 node scripts/check-api-contract.mjs

# ── CI 同款检查 ──
cd gateway4j-admin-ui
npm run type-check          # vue-tsc
npx vitest run              # 1681 例单测

# 后端单测（96 例）
mvn -pl gateway4j-admin -am test

# ── 夜间回归等价跑法 ──
# 1) 先起 Docker 的 pg-17（库 gateway4j / 账号 admin / 密码 test@2026）与 redis-7
# 2) 构建并拉起后端
mvn -q clean package -pl gateway4j-admin-boot -am -DskipTests
java -jar gateway4j-admin-boot/target/gateway4j-admin-boot.jar   # 9301
# 3) 前端
cd gateway4j-admin-ui && npm run dev                            # 9302
# 4) 回归矩阵（注意：本地 node_modules 锁的是 @playwright/test 1.60.0，
#    浏览器 build 1223 已装好；不要在本机随意升级 playwright）
npx playwright test --config=playwright.regression.config.ts --reporter=list
```

注意：回归用例会写库。CI 每次运行使用全新 service 容器天然隔离；**本地**跑前
确认 pg/redis 已起（Mac 本地 Docker 需先起容器，否则全部超时）。

## 已知契约缺口（2026-10-28 首次扫描）

`check-api-contract` 当前报告 1 个真实缺口，**未修产品码**（超出 CI 交付范围）：

- `GET /v1/plugins/{id}` —— 前端 `gateway4j-admin-ui/src/api/plugins.ts:57`
  的 `getPlugin(id)` 被插件编辑页 `src/views/plugins/Editor.vue:195` 在生产
  路径调用，但后端 `PluginController` 只有 list / global / builtin-types 三个
  GET，无按 id 单查端点（单测因 mock 了 `getPlugin` 而漏过）。

处置建议：后端补 `@GetMapping("/{id}")` 或前端改用列表数据合拢；
合拢前 `ci.yml` 的 **guards** job 会持续红——它独立于 frontend/backend 两个
门槛 job，不阻塞其余检查；合拢后自动变绿并转为阻塞级护栏。

## Artifacts 策略（nightly）

无论回归成败，一律上传（保留 14 天）：

| artifact | 路径 | 内容 |
|---|---|---|
| `regression-report` | `test-report/` | e2e helper 截图等回归报告 |
| `playwright-test-results` | `gateway4j-admin-ui/test-results/` | Playwright 原始结果 |
| `service-logs` | `admin-boot.log`、`vite-dev.log` | 后端/前端启动日志（排障用） |

## 环境一致性

- 后端连接串来自 `gateway4j-admin-boot/src/main/resources/application.yml`：
  `jdbc:postgresql://localhost:5432/gateway4j`（admin / test@2026）、
  redis `localhost:6379`——nightly 的 service 容器按同值注入，不改任何配置文件。
- 健康判定：`/v1/dict/ROUTE_TYPE` 匿名访问只要返回任意 HTTP 状态（含 401/500）
  即认为 Spring 启动完成（Flyway 迁移在启动期执行）；上限 240s。
- 回归配置 `playwright.regression.config.ts` 的 `webServer.reuseExistingServer:
  true` 会复用步骤里预先拉起的 vite dev（9302）。
