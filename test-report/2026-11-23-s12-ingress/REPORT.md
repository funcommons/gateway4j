# S12 路由创建改造批 · 实播证据报告（K8s Ingress 风格 + SCG 原生谓词）

- **日期**：2026-11-23
- **用户指令**：「路由创建 要 100% Spring Cloud Gateway 对齐 -- 这个好象没有实现」+「不要向导, 要仿 k8s ingress 配置页」
- **裁决四项**：保留旧 Wizard 文件但入口摘除 / 引擎补齐 SCG 原生谓词全集 / pathType 三值全上 / 同时做 YAML 视图
- **结论**：**四票全绿 + 真实流量全矩阵实锤**。SCG 谓词语义由 SCG 自己的工厂保证（不是自研近似）；K8s Ingress 结构无损映射为普通 BACKEND 路由。

---

## 1. 交付的四票

| 票 | commit | 规模 | 要点 |
|---|---|---|---|
| S12-1 引擎 SCG 原生谓词 | `4203e78` | +1118 | 新表 `gw_route_predicate`；SCG `RoutePredicateFactory` + `ConfigurationService` 双轨绑定；path ∧ 谓词 AND；缺参 fail-closed；SpEL 拦截；禁 N+1；engine 268 |
| S12-3 管理面批量 API | `897c16d` | +936 | `POST /v1/routes/ingress` 事务化建 N 路由 + Host 谓词行 + 绑定行；pathType 三值映射；`plugin_id` 存在性校验；新码 `ROUTE_NAME_CONFLICT(10609)`；admin 480 |
| S12-4 UI Ingress 单页 + YAML | `476282d`+`fe7c788`+`0bf8cd3` | +2673 | IngressForm 825 行（metadata/rules/filters/高级谓词）+ FcYamlEditor 395 行 + js-yaml 懒加载；**四处创建入口全切** `/v2/routes/new`；680→3155 全量绿 |
| S12-2 引擎路径语义统一 | `117b326` | +645 | `{segment}` 变量路由不再静默 404；仲裁确定化（精确→DISPATCH→注册顺序）；尾斜杠统一为 SCG 默认；模拟器与引擎同一份实现；engine 287 / admin 485 |

## 2. 侦察推翻的乐观判断（先说清楚，避免误导）

「100% SCG 对齐」在**既有架构下不可达**——两路只读侦察 + SCG 4.3.1 源码逐条核对查出四个硬阻断：

1. **条件 OR 语义**：`RouteDispatcher.dispatchRecursive` 对同一路由的多条条件按 priority 升序**首个命中即止**（OR），无 AND 组 → 表达不了 `host AND path`（K8s Ingress 的核心语义）；
2. **扁平 path matcher 仲裁不确定**：DISPATCH+BACKEND 全塞进一个扁平表，注册顺序 = `selectList(null)`（**无 ORDER BY**）→ 结果依赖 DB 返回顺序，后置路由可能抢走入口；
3. **PATH 条件无 pattern 语法**：自研 matcher 是纯字符串算子（EQ 全串 / CONTAINS 子串 / REGEX find），**无 `**`/`{seg}` 语义** → 与 SCG 注册层语义分裂，`/foo/{segment}` 静默 404；
4. **13 类条件中 9 类有可观测行为差异**：SCG 正则是全串 `matches`、gw4j 是子串 `find`；SCG 遍历全部 header/cookie 值、gw4j 只取首个；HOST 的 `**.example.com` 在 SCG 能匹配裸域、gw4j 的 `(?:[^.]+\.)+` 不行；METHOD SCG 多值且大小写敏感、gw4j 单值且不敏感；BETWEEN SCG 两端开、gw4j 左闭右开。

**方案因此转向**：不在近似机制上打补丁，而是引入**路由级 SCG 原生谓词**（`gw_route_predicate` 表存 SCG shortcut 定义串），由 SCG 自己的工厂绑定并与 path 谓词 AND 组合 → **K8s Ingress 映射随之无损**（每个 (host, path) = 一条普通 BACKEND 路由），阻断 1/2/3 在主流程上全部消失。gateway4j 的 DISPATCH/权重/条件分发作为**扩展编排层保留**（SCG 无等价物）。

## 3. 真实流量实播矩阵（dev 部署 S12 版 jar，V1.7.0 迁移已执行）

测试路由经 **`POST /v1/routes/ingress`**（即新 UI 的落库通道）创建 → 发布 → 真实 curl 打到网关：

### 3.1 路由级 SCG 谓词（路由 `v_mc_1`：Host + `Method=GET,POST` + `Cookie=session,^v1$`）

| 请求 | 期望 | 实测 | 判定 |
|---|---|---|---|
| `Host: api.example.com` + `Cookie: session=v1` | 200 | **200** | ✅ |
| 同上但 **POST** | 200（Method 多值含 POST） | **501** | ✅ 请求已路由到上游（501 是 mock 上游未实现 POST 方法，非路由拒绝） |
| 同上但 **PUT** | 404（Method 不含 PUT） | **404** | ✅ |
| `Cookie: session=v2` | 404（正则 `^v1$` 不匹配） | **404** | ✅ |
| `Cookie: session=xv1` | 404（**全串**匹配非子串） | **404** | ✅ SCG 语义 |
| 无 cookie | 404 | **404** | ✅ |
| 错 `Host: evil.com` + 合法 cookie | 404 | **404** | ✅ host 与 cookie AND |

### 3.2 Host 谓词单独验证（路由 `v_probe_1`：`Host=api.example.com`）

| 请求 | 实测 | 判定 |
|---|---|---|
| `Host: api.example.com` | **200** | ✅ 命中并打到上游 |
| `Host: other.com` | **404** | ✅ 路由未被选中 |

### 3.3 路径语义（S12-2 头号修复）

| 路由 path | 请求 | 实测 | 判定 |
|---|---|---|---|
| `/seg/{id}` | `/seg/123` | **200** | ✅ **修复前是静默 404**（分发层按字面全等） |
| `/seg/{id}` | `/seg/abc` | **200** | ✅ 变量段匹配任意一段 |
| `/segn/{id:[0-9]+}` | `/segn/123` | **200** | ✅ SCG PathPattern 正则变量段 |
| `/segn/{id:[0-9]+}` | `/segn/abc` | **404** | ✅ 非数字段不匹配 |
| `/exact`（EXACT） | `/exact` | **200** | ✅ |
| `/exact`（EXACT） | `/exact/` | **200** | ✅ 尾斜杠统一为 SCG 默认 `matchTrailingSlash=true` |
| `/exact`（EXACT） | `/exact/x` | **404** | ✅ 精确不匹配 |
| `/probe/**`（PREFIX） | `/probe/`、`/probe/a/b` | **200** / **200** | ✅ 前缀与多段 |

### 3.4 落库核对（Ingress API 通道）

```sql
-- 路由行
 id | route_name | route_type | path       | upstream_url          | status
2124845089785311233 | v_probe_1 | BACKEND | /probe/** | http://127.0.0.1:8091 | PUBLISHED
-- 谓词行（SCG 原生定义串）
 route_id | definition          | sort_order
2124845089785311233 | Host=api.example.com | 0
2124845182655590402 | Method=GET,POST      | 1
2124845182655590402 | Cookie=session,^v1$  | 2
```
`pathType` 映射实锤：`PREFIX` 的 `/probe` → 落 `/probe/**`；`IMPLEMENTATION_SPECIFIC` 的 `/segn/{id:[0-9]+}` 原样落库。

## 4. 界面实拍（见 screenshots/）

| 截图 | 内容 |
|---|---|
| `ing-01-form-empty.png` | Ingress 单页空态：元数据 / 规则(rules) / 过滤器(filters) / 高级谓词(predicates) 四区 + 右上「表单 ⇄ YAML」双视图切换 |
| `ing-03-form-filled.png` | 填入一条规则（域名 `api.example.com` + 路径 `/api` + 路径类型「前缀（Prefix）」+ 服务 `user-service` + 端口 `8080`） |
| `ing-05-yaml-view.png` | YAML 视图（K8s 风味，带行号与语法高亮）：<br>`metadata{name,environment,remark,tags}` / `spec.rules[].host` / `paths[].path`+`pathType`+`backend{service,port}` / `filters[]` / `predicates[]` |

侧栏「新建路由」叶子、列表页「新建」按钮、⌘K 动作组、⌘K 页面搜索组——**四处创建入口全部指向 `/v2/routes/new`**；旧 5 步向导 `/v2/routes/wizard` 页面与路由项保留（可直达），但不再是任何导航目标。

## 5. 诚实标注的遗留

1. **分发层仲裁首键仍是「精确优先于通配」**（DISPATCH 优先只在同等精确度时生效）。若存在「BACKEND 精确 path + DISPATCH 通配 path」，分发层仍判给 BACKEND（直返、跳过父路由条件），而 SCG 注册层按 order 判给 DISPATCH → 该角两层仍不一致。改首键会改变既有路由行为（按「不破坏既有行为优先」未改）。**建议下一批**：让 `DispatchRoutingFilter` 直接采用 SCG 已命中的 route id（`GATEWAY_ROUTE_ATTR`）作为分发入口，消除「分发层二次匹配」这一根本冗余。
2. **9/13 类条件的行为差异仍在分发层**（`RouteConditionMatcher` 未动）——**路由级**谓词走 SCG 原生，分发层条件仍是 gateway4j 扩展语义。
3. **GROOVY / BETWEEN / WEIGHT 三类 SCG 无等价物**（BODY 机制异构：SCG 仅 Java API、gw4j 走 JsonPath）→ 保留为 gateway4j 扩展谓词，UI 标注「扩展（非 SCG 标准）」。
4. **管理面 CRUD 未覆盖路由级谓词**：本批只提供批量 Ingress 通道写谓词行，手工编辑单条路由的谓词（管理端 API/UI）未做。
5. **Ingress 建的路由与既有 DISPATCH 路由路径前缀重叠时**：DISPATCH 语义（`order=-1_000_000` 恒在前）会让父路由先被选中，Ingress 建的同前缀 BACKEND 路由可能不被直接命中——K8s Ingress 语义下这是「host 路由」与「网关分发路由」两种模型的共存问题，需在产品层明确边界。
6. **幂等未接 Idempotency-Key**（admin 模块现无先例），重复提交靠重名预检 `10609` 兜底。
7. **`v2.nav.wizard` i18n key 保留**（旧向导页面仍在，其单测钉死该 key）。
