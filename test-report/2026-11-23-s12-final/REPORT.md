# S12 终局 · V 实播证据报告（SCG 1:1 全链路：batch API → 引擎 filter 真实流量）

- **日期**：2026-11-23
- **前置**：双 boot 重建部署（S12-7a/b/b2 新 jar），部署顺序= admin-boot 先起（Flyway）→ 真库核对 → gateway-boot；真库实证 `flyway: 1.7.1|route filter and metadata|t`、`gw_route.metadata` JSONB 列实存
- **结论**：**SCG 原生 filter 在网关流量级真实生效**（RewritePath 改写转发路径 + AddRequestHeader 注入请求头均为上游实收），batch API Path= 抽取实锤，负例全对。

---

## 1. batch API 响应实锤（`POST /v1/routes/batch`）

```json
{"code":0,"data":{"created":[
  {"route_id":"2124890946081574914","route_name":"v_scg_rp","uri":"http://127.0.0.1:8093",
   "path":"/vscp/**","predicates_count":0,"filters_count":1},
  {"route_id":"2124890946115129345","route_name":"v_scg_hdr","uri":"http://127.0.0.1:8093",
   "path":"/vsch/**","predicates_count":0,"filters_count":1}]}}
```

`predicates_count:0` + `path:"/vscp/**"` 同时成立 = **Path= 谓词抽取实锤**（pattern 落 `gw_route.path`，不落谓词行，防引擎双评）；filters 各 1 行落 `gw_route_filter`。

## 2. SCG filter 真实流量矩阵（探测上游 8093 回显 path+全部请求头）

| 路由 | filter | 请求 | 期望 | 实测 | 判定 |
|---|---|---|---|---|---|
| v_scg_rp | `RewritePath=/vscp/(?<segment>.*), /${segment}` | `GET /vscp/deep/path` | 上游收到 `/deep/path` | **upstream path = /deep/path** | ✅ SCG RewritePath 流量级真跑 |
| v_scg_hdr | `AddRequestHeader=X-Proof, s12-8-live` | `GET /vsch/x` | 上游收到该头 | **X-Proof = s12-8-live** | ✅ SCG AddRequestHeader 流量级真跑 |
| （未注册路径） | — | `GET /vscx/xx` | 404 | **404** | ✅ |
| v_scg_hdr（offline 后） | — | `GET /vsch/x` | 404 | **404** | ✅ 停用→网关重载→不再服务 |

**publish 幂等守卫反证**：对已 PUBLISHED 的 v_scg_rp 二次 publish → `10605 仅 DRAFT/OFFLINE 状态可发布`（恰证发布状态机生效；batch 建的路由初始 DRAFT、发布一次即 PUBLISHED 并经 ConfigChangeEvent 驱动网关热载）。

## 3. E2E 批次（S12-8a，4/4 绿 + 回归 18/18）

`gateway4j-admin-ui/e2e-regression/12-scg-routes.spec.ts`：
- 12-01 新建页骨架/缺省值/切换器 aria-pressed
- 12-02 双视图同步（YAML `spring.cloud.gateway.routes` 11 字段片段逐一可见）→ 提交 → DRAFT 引导条 + 未自动跳转 + batch 调用记录
- 12-03 发布 → **真实流量 200（上游回显 `UPSTREAM OK /scge2e/e2e-traffic`）** + 错 Host 负例 404（Path∧Host AND）
- 12-04 落库形态契约断言（BACKEND/uri/path/status/sort_order/metadata JSONB + 谓词行/filter 行逐条）

回归 `03-routes.spec.ts` 18/18（第 4 轮；前三轮失败经定性为 9301 间歇 stall + 两个既有用例脆弱点，非本批缺陷，证据存档 `test-report/2026-11-23-s12-8a-regression*/`）。

## 4. 测后清理核账（真库）

```
route|7      （= V1.1.0 七条种子，is_deleted=0 全在）
predicate|0
filter|0
```

V 实播两条路由及其谓词/filter 行已物理删除；8093 探测上游已停运；S12-8a 的 22 条 E2E 残留亦已清理。

## 5. 终局基线

| 模块 | 基线 |
|---|---|
| gateway4j-engine | **312**（287 → +19 S12-7a → +6 S12-7b2） |
| gateway4j-admin | **496**（490 → +6 净增 S12-7b） |
| gateway-boot / admin-boot / common / builtins | 25 / 18 / 95 / 275 零漂移 |
| 前端 vitest | **3194**（routes+locales 696 → 721，全仓 208 文件） |
| vue-tsc / eslint / build | 0 错 / 0 错（11 条存量 warning 未触碰文件）/ 成功 |
