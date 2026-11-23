# 可视化网关 - API 契约 V1.3.0

## 1. 基础信息

| 项 | 值 |
|---|---|
| 项目名称 | 可视化网关（gateway4j） |
| Base URL | `/v1` |
| 认证方式 | framework4j-accesstoken JWT Bearer Token |
| 响应格式 | JSON，snake_case |
| 关联文档 | PRODUCT.md（PRD）、TECHNICAL_DESIGN.md（技术方案） |

---

## 2. 通用规范

### 2.1 请求头

| Header | 必填 | 说明 |
|---|---|---|
| `Authorization` | 是（需认证接口） | `Bearer <access_token>` |
| `Idempotency-Key` | 是（写操作） | UUID v4，幂等键，服务端保留 48h |
| `Content-Type` | 是 | `application/json`（multipart/form-data 除外） |

> **Idempotency-Key 说明**：Idempotency-Key 作为请求 Header 传递，与 Content-Type 无关，包括 multipart/form-data 上传场景也通过 Header 携带。

### 2.2 响应信封（6 字段必返）

**成功**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "892310293123123",
    "route_name": "api-gateway"
  },
  "error": null,
  "trace_id": "c0a8010116983728001",
  "timestamp": 1718660400000
}
```

**失败**（data 必须 null）：

```json
{
  "code": 10100,
  "message": "请求参数错误",
  "data": null,
  "error": [
    {
      "field": "route_name",
      "code": "REQUIRED_MISSING",
      "message": "路由名称不能为空",
      "value": null
    }
  ],
  "trace_id": "c0a8010116983728001",
  "timestamp": 1718660400000
}
```

### 2.3 全局规则

- 业务异常统一 HTTP 200，`code` 决定结果
- ID 必须返回 String（雪花 ID / 自增 ID 均转 String）
- 失败时 `data` 必须 null
- `trace_id` 同时通过响应头 `X-Trace-Id` 返回
- URL 路径参数 / 查询参数 / body 字段统一 snake_case
- URL 资源段用 kebab-case（如 `/v1/route-plugin-bindings`）
- **写操作幂等**：所有写操作（POST/PUT/PATCH/DELETE）需携带 `Idempotency-Key` Header，但以下接口除外：登录、Token 刷新、校验接口（validate-groovy、validate）

### 2.4 分页（Offset 模式）

**请求**：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | Integer | 否 | 1 | 页码，从 1 开始 |
| page_size | Integer | 否 | 20 | 每页条数，最大 100 |

**响应 data**：

```json
{
  "list": [],
  "total": 128,
  "page": 1,
  "page_size": 20,
  "has_more": true
}
```

### 2.5 错误码

| 错误码 | 说明 | error code |
|---|---|---|
| 0 | 成功 | - |
| 10100 | 参数校验失败 | - |
| 10101 | 必填字段缺失 | `REQUIRED_MISSING` |
| 10102 | 格式不正确 | `FORMAT_INVALID` |
| 10200 | 未登录 | - |
| 10201 | Token 过期 | - |
| 10300 | 权限不足 | - |
| 10400 | 资源不存在 | `NOT_FOUND` |
| 10401 | 唯一性冲突（名称重复） | `UNIQUE_CONFLICT` |
| 10402 | 状态冲突（乐观锁版本冲突/如删除已发布路由） | `STATE_CONFLICT` |
| 10500 | 请求限流 | - |
| 10501 | 重复提交 | - |
| 10600 | JAR 插件校验失败 | `PLUGIN_VALIDATION_FAILED` |
| 10601 | Groovy 脚本编译失败 | `SCRIPT_COMPILE_FAILED` |
| 10602 | 插件未实现 SDK 接口 | `PLUGIN_SDK_VIOLATION` |
| 10603 | 路由循环引用 | `CYCLIC_REFERENCE` |
| 10604 | 分发路由嵌套超限 | `DEPTH_EXCEEDED` |
| 10609 | 路由名称已存在（S12 批量建路由同环境重名预检） | `ROUTE_NAME_CONFLICT` |
| 10699 | 网关引擎内部错误 | `ENGINE_INTERNAL_ERROR` |

---

## 3. 认证接口

### 3.1 POST /v1/auth/login

登录获取 Token。**无需 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | String | 是 | 用户名 |
| password | String | 是 | 密码 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| access_token | String | 访问令牌，有效期 2h |
| refresh_token | String | 刷新令牌，有效期 30d |
| expires_in | Integer | access_token 剩余秒数 |
| password_stale | Boolean | **P2-9 平铺追加**：当前登录用户口令是否仍为出厂弱口令 admin123。**非阻断提示**——不强制改密、不拦截任何流程，仅供前端展示改密横幅；改密端点见 §7.5/§7.3（改密后下次登录即 false） |

### 3.2 POST /v1/auth/refresh

刷新 Token。**无需 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| refresh_token | String | 是 | 刷新令牌 |

**响应 data**：同登录响应

---

## 4. 路由管理接口

### 4.1 GET /v1/routes

路由列表（树形）。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_type | String | 否 | DISPATCH/BACKEND |
| status | String | 否 | DRAFT/PUBLISHED/OFFLINE/CHANGING |
| keyword | String | 否 | 搜索路由名称 |

**响应 data**：路由树

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 路由 ID |
| route_name | String | 路由名称 |
| route_type | String | DISPATCH/BACKEND |
| path | String | 匹配路径 |
| upstream_url | String | 后端地址 |
| status | String | 状态 |
| sort_order | Integer | 排序 |
| remark | String | 描述 |
| config_version | String | 配置版本号 |
| children | Array | 子路由列表 |
| plugins | Array | 绑定的插件摘要 |
| created_at | Long | 创建时间戳（毫秒） |
| updated_at | Long | 更新时间戳（毫秒） |

> plugins 项结构：`{ plugin_id: String, plugin_name: String, plugin_phase: String, sort_order: Integer }`

**路由对象**：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 路由 ID |
| route_name | String | 路由名称 |
| route_type | String | DISPATCH/BACKEND |
| path | String | 匹配路径 |
| upstream_url | String | 后端地址 |
| status | String | 状态 |
| sort_order | Integer | 排序 |
| remark | String | 描述 |
| config_version | String | 配置版本号 |
| conditions | Array | 分发条件列表（仅 DISPATCH 类型） |
| plugins | Array | 绑定的插件摘要 |
| created_at | Long | 创建时间戳（毫秒） |
| updated_at | Long | 更新时间戳（毫秒） |

> conditions 项结构同 4.2 请求 conditions 项；plugins 项结构：`{ plugin_id: String, plugin_name: String, plugin_phase: String, sort_order: Integer }`

### 4.2 POST /v1/routes

创建路由。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_name | String | 是 | 路由名称 |
| route_type | String | 是 | DISPATCH/BACKEND |
| path | String | 条件必填 | 后置路由时必填 |
| upstream_url | String | 条件必填 | 后置路由时必填 |
| parent_route_id | String | 否 | 父路由 ID |
| sort_order | Integer | 否 | 排序，默认 0 |
| remark | String | 否 | 描述 |
| conditions | Array | 条件必填 | 分发路由时必填 |
| plugin_ids | Array<String> | 否 | 绑定的插件 ID 列表 |

**conditions 项**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| condition_type | String | 是 | 13 类 SCG predicate 全集：HEADER/PATH/QUERY/BODY/GROOVY/WEIGHT/HOST/METHOD/COOKIE/REMOTE_ADDR/AFTER/BEFORE/BETWEEN（S10 批对齐） |
| operator | String | 是 | EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT |
| condition_key | String | 否 | 条件键（按类型，见下表） |
| condition_value | String | 否 | 条件值（按类型，见下表） |
| target_route_id | String | 是 | 匹配后跳转的路由 ID |
| priority | Integer | 否 | 优先级，默认 0 |

> **条件必填规则**：HEADER/PATH/QUERY/BODY 类型 + EQ/NE/CONTAINS/REGEX/GT/LT 运算符时，condition_key 和 condition_value 均必填；EXISTS 运算符可省略 condition_value；GROOVY 类型可省略 condition_key。**S10 批新增七类型**（对齐 Spring Cloud Gateway predicate 全集）：COOKIE 的 condition_key 必填；HOST/METHOD/REMOTE_ADDR/AFTER/BEFORE/BETWEEN 留空 condition_key、condition_value 必填；WEIGHT 语义不变（condition_key=权重整数，condition_value 可空）。

**各类型 key/value 填写口径（S10 批对齐 Spring Cloud Gateway predicate）**：

| 类型 | condition_key | condition_value | 求值口径 |
|---|---|---|---|
| HEADER | Header 名（必填） | 期望值/正则（按 operator） | 取首个值走通用 operator；键缺失时 EXISTS=false、NE=true（gateway4j 既有口径，与 SCG 谓词缺值=false 不同，保留） |
| PATH | 既有校验仍必填（引擎求值不使用） | 期望值/正则 | 对完整请求路径走通用 operator |
| QUERY | 参数名（必填） | 期望值/正则 | 同 HEADER 缺失口径 |
| BODY | JsonPath（必填，`$.` 前缀可省） | 期望值 | 需缓存请求体；字段缺失 NE=true、EXISTS=false |
| GROOVY | 可省略 | Groovy 脚本（沙箱，返回 true 命中） | 需真实请求上下文 |
| WEIGHT | 权重正整数字符串（必填） | 可空忽略 | 非请求谓词：同分发路由无其他条件命中时按权重随机选目标 |
| HOST | 留空 | SCG HostPredicate pattern（如 `**.example.com`）或正则 | 预编译缓存；Host 头缺失=false |
| METHOD | 留空 | HTTP 方法（GET/POST/...） | EQ 比较大小写不敏感 |
| COOKIE | Cookie 名（必填） | 期望值（按 operator） | 取首个匹配 Cookie；缺失口径同 HEADER |
| REMOTE_ADDR | 留空 | CIDR（IPv4/IPv6） | IpSubnetFilterRule 口径前缀比较；无斜杠=单值精确匹配 |
| AFTER | 留空 | ISO-8601 时刻（如 `2026-01-01T00:00:00+08:00`） | 请求时刻晚于 value 命中 |
| BEFORE | 留空 | ISO-8601 时刻 | 请求时刻早于 value 命中 |
| BETWEEN | 留空 | `start,end`（逗号分隔） | 请求时刻落在 [start, end) 闭开区间命中 |

> **性能注记（S10 批）**：REGEX/HOST 预编译缓存（ConcurrentHashMap），不再每请求 `Pattern.compile`。

**响应 data**：路由对象

### 4.3 PATCH /v1/routes/{id}

修改路由。**需携带 Idempotency-Key**

**请求**：同创建，所有字段可选；另支持可选 `expected_version`（Long，P1-5 乐观锁）：
缺省 = 不校验（兼容旧调用）；携带且 ≠ 当前 `config_version` → `10402 路由已被他人修改，请刷新后重试`。
画布「应用到路由树」（POST /v1/routes/{id}/canvas/apply）走 diff 流，豁免不校验。

> **PATCH 字段语义（2026-10-29 修复）**：`null`/未携带 = 不修改该项（load-modify-save +
> 显式字段白名单）。此前 PATCH 只改 `remark` 会把 `status` 静默重置为 DRAFT、并把
> `sort_order`/`tags`/`config_version` 踩成默认值——已修复；`status`/`route_type`/
> `config_version` 不经 PATCH 变更（status 只经 publish/offline 端点流转）。

**响应 data**：路由对象

### 4.4 DELETE /v1/routes/{id}

删除路由（仅 DRAFT/OFFLINE 状态可删除）。**需携带 Idempotency-Key**

**响应 data**：null

### 4.5 POST /v1/routes/{id}/publish

发布路由。**需携带 Idempotency-Key**

**请求**（可选，2026-10-29 起）：`{"change_description": "..."}`（String，**UI 侧必填，
API 侧可选**——不带 body 的旧调用完全兼容）。携带时随 framework4j-audit 切面
（logArgs 默认 true）写入审计行 `args_json`（实测定案：`args_json =
[<route_id>,{"changeDescription":"..."}]`——框架内部 ObjectMapper 序列化，字段名为
驼峰 `changeDescription`；前端展示变更说明从此读取），审计 `action` 仍为
`PUBLISH_ROUTE`，审计查询见 §18.3（`GET /v1/audit/logs`）。

**响应 data**：路由对象（status=PUBLISHED）

### 4.6 POST /v1/routes/{id}/offline

下线路由。**需携带 Idempotency-Key**

**响应 data**：路由对象（status=OFFLINE）

### 4.7 POST /v1/routes/validate

校验路由配置（循环检测、嵌套深度）。**无需 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_id | String | 否 | 编辑已有路由时传 ID |
| conditions | Array | 是 | 条件列表 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| is_valid | Boolean | 是否合法 |
| errors | Array | 错误列表 |
| errors[].error_code | String | 错误码 |
| errors[].message | String | 错误描述 |
| errors[].route_id | String | 涉及的路由 ID |

### 4.8 GET /v1/routes/{id}/canvas

获取画布数据。

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| route_id | String | 路由 ID |
| canvas_data | Object | 画布数据（nodes + edges） |

> canvas_data 结构：`{ nodes: Array<{ id: String, type: String, position: { x: Number, y: Number }, data: Object }>, edges: Array<{ id: String, source: String, target: String, data: Object }> }`

### 4.9 PUT /v1/routes/{id}/canvas

保存画布数据。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| canvas_data | Object | 是 | 画布数据（nodes + edges） |

**响应 data**：null

---

## 5. 插件管理接口

### 5.1 GET /v1/plugins

插件列表（分页）。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | Integer | 否 | 页码，默认 1 |
| page_size | Integer | 否 | 每页条数，默认 20 |
| plugin_type | String | 否 | BUILTIN/JAR/GROOVY/GROUP |
| plugin_phase | String | 否 | PRE/POST |
| scope | String | 否 | GLOBAL/ROUTE |
| status | String | 否 | ENABLED/DISABLED/UNINSTALLED |

**响应 data**：分页列表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 插件 ID |
| plugin_name | String | 插件名称 |
| plugin_id | String | 插件标识 |
| plugin_type | String | 类型 |
| plugin_phase | String | 阶段 |
| scope | String | 作用域 |
| status | String | 状态 |
| sort_order | Integer | 排序 |
| config | String | 配置参数 JSON |
| remark | String | 描述 |
| group_members | Array | 分组插件成员（仅 GROUP 类型） |
| jar_info | Object | JAR 插件信息（仅 JAR 类型） |
| groovy_info | Object | Groovy 插件信息（仅 GROOVY 类型） |
| created_at | Long | 创建时间戳（毫秒） |
| updated_at | Long | 更新时间戳（毫秒） |

**插件子对象定义**：

**jar_info**（仅 JAR 类型）：

| 字段 | 类型 | 说明 |
|---|---|---|
| jar_path | String | JAR 文件路径 |
| jar_md5 | String | JAR 文件 MD5 |
| main_class | String | 主类全限定名 |

**groovy_info**（仅 GROOVY 类型）：

| 字段 | 类型 | 说明 |
|---|---|---|
| script_md5 | String | 脚本 MD5 |
| compile_status | String | 编译状态 |
| compile_error | String | 编译错误信息 |

**group_members**（仅 GROUP 类型）：

| 字段 | 类型 | 说明 |
|---|---|---|
| plugin_id | String | 插件 ID |
| plugin_name | String | 插件名称 |
| sort_order | Integer | 排序 |

**插件对象**：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 插件 ID |
| plugin_name | String | 插件名称 |
| plugin_id | String | 插件标识 |
| plugin_type | String | 类型 |
| plugin_phase | String | 阶段 |
| scope | String | 作用域 |
| status | String | 状态 |
| sort_order | Integer | 排序 |
| config | String | 配置参数 JSON |
| remark | String | 描述 |
| group_members | Array | 分组插件成员（仅 GROUP 类型） |
| jar_info | Object | JAR 插件信息（仅 JAR 类型） |
| groovy_info | Object | Groovy 插件信息（仅 GROOVY 类型） |
| created_at | Long | 创建时间戳（毫秒） |
| updated_at | Long | 更新时间戳（毫秒） |

> 子对象 jar_info、groovy_info、group_members 结构同上方定义。

### 5.2 POST /v1/plugins

创建插件。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_name | String | 是 | 插件名称 |
| plugin_id | String | 是 | 插件标识 |
| plugin_type | String | 是 | BUILTIN/JAR/GROOVY/GROUP |
| plugin_phase | String | 是 | PRE/POST |
| scope | String | 否 | GLOBAL/ROUTE，默认 ROUTE |
| sort_order | Integer | 否 | 排序 |
| config | String | 否 | 配置参数 JSON |
| remark | String | 否 | 描述 |
| group_member_ids | Array<String> | 条件必填 | GROUP 类型时必填 |
| script_content | String | 条件必填 | GROOVY 类型时必填（缺失/空白拒绝，信封 10605 CONFIG_SYNC_FAILED），内容落 `gw_plugin_groovy`（P2-1 落库修复） |

**响应 data**：插件对象

### 5.3 PATCH /v1/plugins/{id}

修改插件。**需携带 Idempotency-Key**

**请求**：同创建，所有字段可选

| 字段 | 语义 |
|---|---|
| script_content | **P2-1**：非 null 时覆盖 `gw_plugin_groovy.script_content`（同步更新 script_md5、compile_status 复位 PENDING）；null = 本次不涉及脚本，**保留原脚本不清空**（PATCH 语义） |

**响应 data**：插件对象

### 5.4 DELETE /v1/plugins/{id}

删除插件（仅 DISABLED/UNINSTALLED 状态可删除，BUILTIN 不可删除）。**需携带 Idempotency-Key**。P2-1：同步清理 `gw_plugin_groovy` 脚本行与分组成员行。

**响应 data**：null

### 5.5 POST /v1/plugins/{id}/enable

启用插件。**需携带 Idempotency-Key**

**响应 data**：插件对象（status=ENABLED）

### 5.6 POST /v1/plugins/{id}/disable

禁用插件。**需携带 Idempotency-Key**

**响应 data**：插件对象（status=DISABLED）

### 5.7 POST /v1/plugins/upload-jar

上传 JAR 插件。**需携带 Idempotency-Key**（通过请求 Header 传递，与 multipart/form-data 无关）

**请求**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| file | File | 是 | JAR 文件，≤ 50MB |
| plugin_name | String | 是 | 插件名称 |
| plugin_id | String | 是 | 插件标识 |
| plugin_phase | String | 是 | PRE/POST |
| scope | String | 否 | GLOBAL/ROUTE |
| config | String | 否 | 配置参数 JSON |
| remark | String | 否 | 描述 |

**响应 data**：插件对象（含校验结果）

### 5.8 POST /v1/plugins/validate-groovy

校验 Groovy 脚本。**无需 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| script_content | String | 是 | Groovy 脚本内容 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| is_valid | Boolean | 是否合法 |
| error_line | Integer | 错误行号 |
| error_message | String | 错误信息 |

### 5.9 GET /v1/plugins/global

全局插件列表。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_phase | String | 否 | PRE/POST |

**响应 data**：插件列表（同 5.1 响应 data 中 list 项结构，按 sort_order 排序，非分页）

### 5.10 PUT /v1/plugins/global/sort

调整全局插件排序。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_phase | String | 是 | PRE/POST |
| plugin_ids | Array<String> | 是 | 插件 ID 有序列表 |

**响应 data**：null

---

## 6. 监控接口

### 6.1 GET /v1/monitor/routes/status

路由状态列表。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_id | String | 否 | 路由 ID，不传返回全部 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| route_id | String | 路由 ID |
| route_name | String | 路由名称 |
| status | String | HEALTHY/ERROR/CIRCUIT_OPEN |
| active_connections | Integer | 当前活跃连接数 |
| total_requests | Long | 总请求数 |
| error_count | Long | 错误数 |
| error_rate | Number | 错误率 |
| p50_latency_ms | Number | P50 延迟 |
| p95_latency_ms | Number | P95 延迟 |
| p99_latency_ms | Number | P99 延迟 |
| qps | Number | 当前 QPS |
| upstream | Object\|null | **P2-6 可选扩展**：上游主动探测结果 `{reachable:Boolean, latency_ms:Number, checked_at:Number(ms)}`；探测未覆盖（非 PUBLISHED BACKEND）、HASH 过期（TTL 90s）、Redis 不可达时为 null。探测详情见 §18.3 |

### 6.2 GET /v1/monitor/routes/{id}/metrics

路由指标详情。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| time_range | String | 否 | 1h/6h/24h/7d，默认 1h |
| granularity | String | 否 | 1m/5m/1h，默认 1m |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| route_id | String | 路由 ID |
| time_range | String | 时间范围 |
| data_points | Array | 指标数据点 |
| data_points[].timestamp | String | 时间戳，ISO-8601（`Instant.toString()`，如 `2026-10-29T07:30:00Z`）；前端 `new Date(iso)` 直解 |
| data_points[].qps | Number | QPS |
| data_points[].latency_p50 | Number | P50 延迟 |
| data_points[].latency_p99 | Number | P99 延迟 |
| data_points[].error_rate | Number | 错误率 |
| data_points[].active_connections | Integer | 活跃连接数 |

### 6.3 GET /v1/monitor/topology

路由拓扑数据。

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| nodes | Array | 节点列表 |
| nodes[].id | String | 路由 ID |
| nodes[].name | String | 路由名称 |
| nodes[].type | String | DISPATCH/BACKEND |
| nodes[].status | String | HEALTHY/ERROR/CIRCUIT_OPEN |
| edges | Array | 连线列表 |
| edges[].source_id | String | 源路由 ID |
| edges[].target_id | String | 目标路由 ID |
| edges[].condition | String | 分发条件摘要 |

---

## 7. 系统管理接口

### 7.1 GET /v1/users

用户列表（分页）。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | Integer | 否 | 页码，默认 1 |
| page_size | Integer | 否 | 每页条数，默认 20 |
| status | String | 否 | ENABLED/DISABLED |
| keyword | String | 否 | 搜索用户名/姓名 |

**响应 data**：分页列表（list 项为用户对象）

**用户对象**：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 用户 ID |
| username | String | 用户名 |
| real_name | String | 真实姓名 |
| phone | String | 手机号 |
| status | String | ENABLED/DISABLED |
| role_codes | Array<String> | 角色编码列表 |
| created_at | Long | 创建时间戳（毫秒） |
| updated_at | Long | 更新时间戳（毫秒） |

### 7.2 POST /v1/users

创建用户。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | String | 是 | 用户名 |
| password | String | 是 | 密码，8-20 位 |
| real_name | String | 否 | 真实姓名 |
| phone | String | 否 | 手机号 |
| role_codes | Array<String> | 是 | 角色编码列表 |

**响应 data**：创建的用户对象

### 7.3 PATCH /v1/users/{id}

修改用户。**需携带 Idempotency-Key**

**请求**：同创建，所有字段可选

**响应 data**：修改后的用户对象

### 7.4 DELETE /v1/users/{id}

软删除用户。**需携带 Idempotency-Key**

**响应 data**：null

### 7.5 POST /v1/users/{id}/reset-password

重置密码。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| new_password | String | 是 | 新密码，8-20 位 |

**响应 data**：null

### 7.6 GET /v1/roles

角色列表。

**响应 data**：角色数组

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 角色 ID |
| role_code | String | 角色编码 |
| role_name | String | 角色名称 |
| remark | String | 描述 |

### 7.7 GET /v1/permissions

当前用户权限列表。

**响应 data**：权限数组

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 权限 ID |
| permission_code | String | 权限编码 |
| permission_name | String | 权限名称 |
| resource_type | String | 资源类型 |
| parent_id | String | 父权限 ID |

---

## 8. 字典接口

### 8.1 GET /v1/dict/{dict_code}

获取字典值。

**响应 data**：

```json
[
  { "value": "DISPATCH", "label": "分发路由" },
  { "value": "BACKEND", "label": "后置路由" }
]
```

**字典 Code 列表**：

| dict_code | 说明 |
|---|---|
| ROUTE_TYPE | 路由类型 |
| ROUTE_STATUS | 路由状态 |
| PLUGIN_TYPE | 插件类型 |
| PLUGIN_PHASE | 插件阶段 |
| PLUGIN_SCOPE | 插件作用域 |
| PLUGIN_STATUS | 插件状态 |
| COND_TYPE | 条件类型 |
| CONDITION_OPERATOR | 条件操作符 |
| BUILTIN_PLUGIN | 内置插件类型（含 plugin_id + 名称 + 阶段 + 描述） |

---

## 9. 路由条件管理接口

> 支持前端可视化编辑单条分发条件，无需整体替换。

### 9.1 POST /v1/routes/{id}/conditions

为路由添加一条分发条件。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| condition_type | String | 是 | 13 类 SCG predicate 全集：HEADER/PATH/QUERY/BODY/GROOVY/WEIGHT/HOST/METHOD/COOKIE/REMOTE_ADDR/AFTER/BEFORE/BETWEEN（S10 批对齐） |
| operator | String | 是 | EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT |
| condition_key | String | 否 | 条件键（按类型，口径同 §4.2） |
| condition_value | String | 否 | 条件值（按类型，口径同 §4.2） |
| target_route_id | String | 是 | 匹配后跳转的路由 ID |
| priority | Integer | 否 | 优先级，默认 0 |

> 各类型 key/value 填写口径、必填规则与求值语义同 §4.2「各类型 key/value 填写口径」表（S10 批对齐 Spring Cloud Gateway predicate 全集），不再重复。

**响应 data**：条件对象（含生成的 id）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 条件 ID |
| route_id | String | 所属路由 ID |
| condition_type | String | 条件类型（13 类，口径见 §4.2） |
| operator | String | 运算符 |
| condition_key | String | 条件键 |
| condition_value | String | 条件值 |
| target_route_id | String | 目标路由 ID |
| priority | Integer | 优先级 |

### 9.2 PUT /v1/routes/{id}/conditions/{condId}

修改单条分发条件。**需携带 Idempotency-Key**

**请求**：同 9.1，所有字段可选

**响应 data**：条件对象

### 9.3 DELETE /v1/routes/{id}/conditions/{condId}

删除单条分发条件。**需携带 Idempotency-Key**

**响应 data**：null

### 9.4 GET /v1/routes/{id}/children

查询分发路由的子路由列表。

**响应 data**：路由数组（结构同 4.1 路由对象，仅返回 parent_route_id = {id} 的子路由）

---

## 10. 路由排序接口

### 10.1 PUT /v1/routes/sort

批量调整路由排序（拖拽场景）。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_ids | Array<String> | 是 | 路由 ID 有序列表，顺序即 sort_order |

**响应 data**：null

---

## 11. 路由-插件绑定管理接口

> 支持前端可视化编排插件链，独立管理路由与插件的绑定关系。

### 11.1 GET /v1/routes/{id}/plugins

查询路由绑定的插件列表（按 sort_order 排序）。

**响应 data**：绑定数组

| 字段 | 类型 | 说明 |
|---|---|---|
| binding_id | String | 绑定记录 ID |
| route_id | String | 路由 ID |
| plugin_id | String | 插件 ID |
| plugin_name | String | 插件名称 |
| plugin_phase | String | PRE/POST |
| sort_order | Integer | 排序 |
| binding_config | String | 路由级插件配置 JSON（覆盖插件全局 config） |

### 11.2 POST /v1/routes/{id}/plugins

为路由绑定一个插件。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_id | String | 是 | 插件 ID |
| sort_order | Integer | 否 | 排序，默认追加到末尾 |
| binding_config | String | 否 | 路由级插件配置 JSON，覆盖插件全局 config |

**响应 data**：绑定对象

### 11.3 PUT /v1/routes/{id}/plugins/{bindingId}

修改绑定配置。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sort_order | Integer | 否 | 排序 |
| binding_config | String | 否 | 路由级插件配置 JSON |

**响应 data**：绑定对象

### 11.4 DELETE /v1/routes/{id}/plugins/{bindingId}

解绑插件。**需携带 Idempotency-Key**

**响应 data**：null

### 11.5 PUT /v1/routes/{id}/plugins/sort

调整路由级插件排序（拖拽场景）。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_phase | String | 是 | PRE/POST |
| binding_ids | Array<String> | 是 | 绑定 ID 有序列表 |

**响应 data**：null

### 11.6 GET /v1/routes/{id}/plugin-chain

预览路由的完整插件链（全局 + 路由级合并）。

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| route_id | String | 路由 ID |
| route_name | String | 路由名称 |
| pre_chain | Array | PRE 阶段插件链（全局 PRE → 路由 PRE，按 sort_order 排序） |
| post_chain | Array | POST 阶段插件链（路由 POST → 全局 POST，按 sort_order 倒序） |

**chain 项结构**：

| 字段 | 类型 | 说明 |
|---|---|---|
| plugin_id | String | 插件 ID |
| plugin_name | String | 插件名称 |
| scope | String | GLOBAL/ROUTE |
| sort_order | Integer | 排序 |
| binding_config | String | 路由级配置（仅 scope=ROUTE 时有值） |

---

## 12. 内置插件类型接口

> 支持前端根据插件类型元数据动态生成配置表单。

### 12.1 GET /v1/plugins/builtin-types

获取所有内置插件类型列表。

**响应 data**：插件类型数组

| 字段 | 类型 | 说明 |
|---|---|---|
| plugin_id | String | 插件标识（如 security、rate-limiter、jwt） |
| plugin_name | String | 插件名称（如 "安全插件"、"限流插件"） |
| plugin_phase | String | PRE/POST |
| description | String | 插件功能描述 |
| config_schema | Object | 配置 JSON Schema（用于前端动态表单生成） |

**config_schema 示例**：

```json
{
  "type": "object",
  "required": ["limit", "window"],
  "properties": {
    "limit": { "type": "integer", "title": "限流阈值", "minimum": 1 },
    "window": { "type": "integer", "title": "时间窗口（秒）", "minimum": 1 },
    "dimension": { "type": "string", "title": "限流维度", "enum": ["IP", "ROUTE", "GLOBAL"], "default": "IP" },
    "mode": { "type": "string", "title": "限流模式", "enum": ["LOCAL", "DISTRIBUTED"], "default": "LOCAL" }
  }
}
```

### 12.2 GET /v1/plugins/builtin-types/{pluginId}/schema

获取单个内置插件类型的配置 Schema。

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| plugin_id | String | 插件标识 |
| plugin_name | String | 插件名称 |
| config_schema | Object | 配置 JSON Schema |

### 12.3 POST /v1/plugins/validate-config

校验插件配置 JSON 是否合法。**无需 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plugin_id | String | 是 | 插件标识 |
| config | String | 是 | 配置 JSON 字符串 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| is_valid | Boolean | 是否合法 |
| errors | Array | 校验错误列表 |
| errors[].field | String | 字段路径 |
| errors[].message | String | 错误描述 |

---

## 13. 实现状态标记

> 标记各端点的实现状态，便于跟踪开发进度。

### 13.1 已实现端点

| 端点 | 状态 |
|---|---|
| POST /v1/auth/login | ✅ 已实现 |
| POST /v1/auth/refresh | ✅ 已实现 |
| GET /v1/routes | ⚠️ 已实现但返回扁平列表，需改为树形 + 含 children/plugins |
| POST /v1/routes | ⚠️ 已实现但 conditions 整体替换，plugin_ids 不支持 binding_config |
| PATCH /v1/routes/{id} | ⚠️ 已实现但不含 parent_route_id，conditions 整体替换 |
| DELETE /v1/routes/{id} | ✅ 已实现 |
| POST /v1/routes/{id}/publish | ✅ 已实现 |
| POST /v1/routes/{id}/offline | ✅ 已实现 |
| POST /v1/routes/validate | ✅ 已实现 |
| GET /v1/plugins | ✅ 已实现 |
| POST /v1/plugins | ✅ 已实现 |
| PATCH /v1/plugins/{id} | ✅ 已实现 |
| DELETE /v1/plugins/{id} | ✅ 已实现 |
| POST /v1/plugins/{id}/enable | ✅ 已实现 |
| POST /v1/plugins/{id}/disable | ✅ 已实现 |
| GET /v1/plugins/global | ✅ 已实现 |
| PUT /v1/plugins/global/sort | ✅ 已实现 |
| GET /v1/users | ✅ 已实现 |
| POST /v1/users | ✅ 已实现 |
| PATCH /v1/users/{id} | ✅ 已实现 |
| DELETE /v1/users/{id} | ✅ 已实现 |
| POST /v1/users/{id}/reset-password | ✅ 已实现 |
| GET /v1/monitor/routes/status | ⚠️ 已实现但返回硬编码零值，需接入 Micrometer |
| GET /v1/monitor/topology | ⚠️ 已实现但 edges 永远为空，需计算实际分发关系 |

### 13.2 未实现端点（V1.1.0 已定义）

| 端点 | 状态 |
|---|---|
| GET /v1/routes/{id}/canvas | ❌ 未实现（无 RouteCanvasMapper/Service/Controller） |
| PUT /v1/routes/{id}/canvas | ❌ 未实现 |
| GET /v1/monitor/routes/{id}/metrics | ❌ 未实现 |
| POST /v1/plugins/upload-jar | ❌ 未实现 |
| POST /v1/plugins/validate-groovy | ❌ 未实现 |
| GET /v1/roles | ❌ 未实现 |
| GET /v1/permissions | ❌ 未实现 |
| GET /v1/dict/{dict_code} | ❌ 未实现 |

### 13.3 V1.2.0 新增端点

| 端点 | 状态 | 对应特点 |
|---|---|---|
| POST /v1/routes/{id}/conditions | ❌ 未实现 | 特点1: 流程图式路由编排 |
| PUT /v1/routes/{id}/conditions/{condId} | ❌ 未实现 | 特点1 |
| DELETE /v1/routes/{id}/conditions/{condId} | ❌ 未实现 | 特点1 |
| GET /v1/routes/{id}/children | ❌ 未实现 | 特点2: 多层分发路由 |
| PUT /v1/routes/sort | ❌ 未实现 | 特点1 |
| GET /v1/routes/{id}/plugins | ❌ 未实现 | 特点3: 双阶段插件链 |
| POST /v1/routes/{id}/plugins | ❌ 未实现 | 特点3 |
| PUT /v1/routes/{id}/plugins/{bindingId} | ❌ 未实现 | 特点3 |
| DELETE /v1/routes/{id}/plugins/{bindingId} | ❌ 未实现 | 特点3 |
| PUT /v1/routes/{id}/plugins/sort | ❌ 未实现 | 特点3 |
| GET /v1/routes/{id}/plugin-chain | ❌ 未实现 | 特点3 |
| GET /v1/plugins/builtin-types | ❌ 未实现 | 特点4: 20+ 内置插件 |
| GET /v1/plugins/builtin-types/{pluginId}/schema | ❌ 未实现 | 特点4 |
| POST /v1/plugins/validate-config | ❌ 未实现 | 特点4 |

### 13.4 结构性改造项

| 改造项 | 当前状态 | 目标 | 对应特点 |
|---|---|---|---|
| GET /v1/routes 返回树形 + children/plugins | 返回扁平 List<Route> | 返回树形结构，每项含 children 数组和 plugins 数组 | 特点1,2 |
| PATCH /v1/routes/{id} 支持 parent_route_id | RouteUpdateRequest 不含 parent_route_id | 请求体增加 parent_route_id 字段 | 特点2 |
| 路由创建/更新支持 binding_config | 仅接受 pluginIds 列表 | plugin_ids 升级为 bindings 数组，每项含 plugin_id + binding_config | 特点3 |
| GatewayPlugin 接口增加 configSchema() | 无此方法 | 返回 JSON Schema 字符串，供 /builtin-types 端点使用 | 特点4 |
| Monitor topology 计算实际 edges | edges 永远为空数组 | 从 RouteCondition 表查询 target_route_id 构建边 | 特点2 |
| Monitor status 接入真实指标 | 返回硬编码零值 | 从 Micrometer MeterRegistry 读取实际指标 | 特点4 |

---

## 14. 路由导入导出接口（V1.3.0 新增）

> 路由包自包含：引用关系用 route_name（route_key）和 plugin_id 字符串，不含雪花 ID，可跨环境导入。

### 14.1 GET /v1/routes/export

导出路由包。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| route_ids | Array<String> | 否 | 指定导出的路由 ID，不传导出全部（含子路由） |
| status | String | 否 | 按状态过滤 |

**响应 data**：

```json
{
  "version": "1.0",
  "exported_at": 1784454000000,
  "routes": [
    {
      "route_name": "dispatch-v2",
      "route_type": "DISPATCH",
      "path": "/api/hello",
      "sort_order": 0,
      "conditions": [
        { "condition_type": "HEADER", "operator": "EQ", "condition_key": "X-Version",
          "condition_value": "v2", "target_route_key": "test-backend", "priority": 0 }
      ],
      "plugins": [
        { "plugin_id": "jwt", "binding_config": "{}", "sort_order": 0 }
      ],
      "children": []
    }
  ]
}
```

### 14.2 POST /v1/routes/import

导入路由包。**需携带 Idempotency-Key**

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| data | Object | 是 | 导出的路由包 JSON |
| strategy | String | 是 | 冲突策略：SKIP（同名跳过）/ OVERWRITE（同名覆盖）/ ERROR（同名报错） |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| total | Integer | 包内路由总数 |
| created | Integer | 新建数 |
| updated | Integer | 覆盖数 |
| skipped | Integer | 跳过数 |
| errors | Array | 失败明细 `[{route_name, message}]` |

### 14.3 POST /v1/routes/import/validate

导入预检（dry-run）。**无需 Idempotency-Key**

**请求**：路由包 JSON

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| is_valid | Boolean | 是否可导入 |
| conflicts | Array<String> | 与现有路由同名的 route_name |
| missing_plugins | Array<String> | 引用但不存在的 plugin_id |
| missing_targets | Array<String> | 条件引用但不存在的 target_route_key |
| cycle_warnings | Array<String> | 导入后会形成循环的警告 |

---

## 15. 开放 API（三方系统直连，V1.3.0 新增）

> 供三方平台以编程方式管理路由，无需登录控制台。
> 认证方式：**HMAC-SHA256 签名**（framework4j-signature），不使用 JWT。
> 请求头：`X-Access-Key` + `X-Timestamp` + `X-Nonce` + `X-Signature`。

### 15.1 签名算法

```
signature = HMAC-SHA256(secret, accessKey + timestamp + nonce + bodyMd5)
```

| Header | 必填 | 说明 |
|---|---|---|
| X-Access-Key | 是 | 分配的 appKey |
| X-Timestamp | 是 | 毫秒时间戳，±5min 内有效 |
| X-Nonce | 是 | 随机字符串，10min 内不可重复 |
| X-Signature | 是 | HMAC-SHA256 签名（hex） |

### 15.2 GET /v1/open/routes/export

同 14.1，签名认证。

### 15.3 POST /v1/open/routes/import

同 14.2，签名认证。

### 15.4 POST /v1/open/routes/import/validate

同 14.3，签名认证。

### 15.5 POST /v1/open/routes/{id}/publish

发布路由，签名认证。

### 15.6 POST /v1/open/routes/{id}/offline

下线路由，签名认证。

---

## 16. V1.3.0 实现状态更新

### 16.1 端点状态（全量）

| 端点 | 状态 |
|---|---|
| §3-§8 全部端点 | ✅ 已实现 |
| §9 路由条件管理（3 端点） | ✅ 已实现 |
| §10 路由排序（1 端点） | ✅ 已实现 |
| §11 路由-插件绑定（6 端点） | ✅ 已实现 |
| §12 内置插件类型（3 端点） | ✅ 已实现 |
| §13 标记的 V1.1.0/V1.2.0 端点 | ✅ 全部已实现 |
| §14 路由导入导出（3 端点） | ✅ 已实现（V1.3.0 新增） |
| §15 开放 API（5 端点） | ✅ 已实现（V1.3.0 新增） |

### 16.2 结构性改造项状态

| 改造项 | 状态 |
|---|---|
| GET /v1/routes 树形 + children/plugins | ✅ 已完成 |
| PATCH /v1/routes/{id} parent_route_id | ✅ 已完成 |
| bindings 含 binding_config | ✅ 已完成 |
| GatewayPlugin.configSchema() | ✅ 已完成（默认 "{\"type\":\"object\"}"） |
| Monitor topology 实际 edges | ✅ 已完成 |
| Monitor status Micrometer 指标 | ✅ 已完成 |

### 16.3 内置插件清单更新（30 种）

在 V1.2.0 的 28 种基础上新增 2 种：

| 插件 | plugin_id | 阶段 | 说明 |
|---|---|---|---|
| 钉钉认证 | dingtalk | PRE | 钉钉 SSO OAuth2 登录，回调换取用户信息注入 X-User 头 |
| 安全水印 | watermark | PRE | HTML 响应注入水印 JS（</body> 前），stripCsp=true 时移除 CSP 头 |

#### 16.3.1 dingtalk 配置键（S11-1 补强，schema 见 GET /v1/plugins/builtin-types/dingtalk/schema）

| 键 | 类型 | 缺省 | 说明 |
|---|---|---|---|
| corpId | String | — | 企业 CorpId |
| appKey | String | — | 应用 AppKey |
| appSecret | String | — | 应用 AppSecret（敏感，加密存储） |
| loginServer | String | — | 登录主页 |
| cookieName | String | `fu-gw-token` | 会话 Token Cookie 名 |
| excludePaths | String[] | — | 放行路径（不走登录闸） |
| excludeFileExt | String[] | — | 放行文件扩展名 |
| stateSecret | String | appSecret 派生 | §1 state CSRF HMAC 密钥；缺省 SHA-256(appSecret) 32 字节（敏感，加密存储，schema 标 password 形态） |
| stateTimeout | Integer | 300 | §1 state 签名时效（秒） |
| jwtSecret | String | 回落 appSecret | §4 会话 JWT HS256 密钥；缺省回落 appSecret 并告警一次（敏感，加密存储，schema 标 password 形态） |
| tokenTimeout | Integer | 43200 | §4 会话 JWT 有效期（秒，43200=12h） |
| basePath | String | `""` | §5 logout 路径前缀；空 → 精确匹配 `/logout` |
| logoutRedirect | String | `""` | §5 logout 后跳转地址；空 → 200 JSON，非空 → 302 该址 |

**fu-gw-nick 展示 cookie（S11-6）**：登录成功（回调 302 前）与 `fu-gw-token` 一同下发第二个 Set-Cookie——名 `fu-gw-nick`、**非 HttpOnly**（水印脚本需 JS 可读，会话 token cookie 保持 HttpOnly 不变）、其余属性镜像 token cookie（Path=/）。值=`URLEncoder.encode(maskedNick + "|" + maskedMobile, UTF_8)`（先拼接后整体 encode，`|`→`%7C`，水印脚本 decode 后再 split）；脱敏**服务端执行、原始 PII 不进浏览器**（nick=首字+`*`+余字，1 字不脱敏；mobile=前3+`****`+后4；段为 null/空串则留空，如 `|138****8000`）。生命周期=浏览器会话级（随 token cookie）；logout（含 401 清 cookie 分流）以 maxAge=0 与 token cookie 同步过期清除。读取契约见 16.3.2。

#### 16.3.2 watermark 配置键（S11-2 补强，schema 见 GET /v1/plugins/builtin-types/watermark/schema）

| 键 | 类型 | 缺省 | 说明 |
|---|---|---|---|
| org | String | `企业` | 水印组织名称 |
| color | String | `rgba(200, 128, 128, 0.10)` | 水印颜色 |
| width / height | Integer | 360 / 180 | 单枚水印尺寸（px） |
| fontSize | Integer | 24 | 字号 |
| rotate | Integer | -20 | 旋转角度 |
| maxBodyLength | Integer | 1048576 | 参与注入的最大响应体长度（字节，超限透传） |
| scriptUrl | String | — | 自定义水印脚本 URL |
| sessionCookieName | String | `fu-gw-token` | 会话 cookie 名（对齐 dingtalk cookieName），脚本据此读 JWT payload 个性化文案 |
| stripCsp | Boolean | false | 是否剥离 Content-Security-Policy 头；缺省保留，true 时仅在注入路径删除 |

**用户化身份来源（S11-6）**：脚本 resolveIdentity 优先读展示 cookie `fu-gw-nick`（cfg.nickCookie，键随内联 cfg 字面量与 scriptUrl 外链引导同步传导；DingTalkPlugin 下发，值已服务端预脱敏，decodeURIComponent 后 split('|') 直接使用，nick 段非空才进用户化文案）；读不到/无 nick 段再回落 sessionCookieName 会话 cookie 的 JWT payload 解析 + 本地脱敏（maskName/maskMobile 保留）——HttpOnly 会话 cookie 不可 JS 读，JWT 回退仅服务非 HttpOnly 部署。

---

## 17. P1 修复新增契约（2026-10-29）

### 17.1 GET /v1/config/sync-status（P1-3 发布生效确认）

读网关 reload 水位（Redis `gateway4j:config:sync`，engine 每次 reload 成功后写，TTL 120s）并比对 DB 全局版本（`GREATEST(max gw_route.config_version, max gw_plugin.config_version)`）。

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| available | Boolean | 网关水位是否已知（Redis key 缺失/TTL 过期/拒连/坏 JSON → false，接口绝不 500） |
| gateway | Object\|null | 水位内容：`{version:Number, fingerprint:String, updated_at:Number(ms), instance:String}`；available=false 时为 null |
| db_version | Number | DB 全局最大 config_version（查询失败按 0 降级） |
| in_sync | Boolean | `gateway.version == db_version`；available=false 时恒为 false（宁报未同步，不误报已生效） |

### 17.2 GET /v1/monitor/timeseries（P1-6 指标时序）

Prometheus 优先：`gateway4j.monitor.prometheus-url` 配置且可达时走 Prometheus HTTP API range query（`sum by (path)` 聚合 `gateway4j_requests_total`/`gateway4j_requests_errors`；分位数取 MetricsPlugin Timer 客户端分位 gauge `gateway4j_request_latency_seconds{quantile="..."}`——非 histogram bucket，`histogram_quantile()` 不适用；quantile 序列缺失时该分位退化 avg）。未配置/查询失败 → 快照平铺（本地 MeterRegistry + Redis 指标快照 `gateway4j:metrics:routes`），接口绝不 500。

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| routeId | Number | 是 | 路由 ID |
| timeRange | String | 否 | 1h/6h/24h/7d，默认 1h |
| granularity | String | 否 | 1m/5m/1h，默认 1m |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| source | String | `prometheus` \| `snapshot` |
| quantile_fallback | Boolean | 仅 source=prometheus 且 quantile 序列缺失（分位已按 avg 退化）时出现，值为 true |
| data_points | Array | 数据点（上限 500） |
| data_points[].timestamp | String | ISO-8601（`Instant.toString()`） |
| data_points[].total_requests | Number | 累计请求数 |
| data_points[].error_count | Number | 累计错误数 |
| data_points[].error_rate | Number | 错误率（total>0 时 errors/total，否则 0） |
| data_points[].avg_latency_ms | Number | 平均延迟 ms |
| data_points[].p50_latency_ms | Number | P50 延迟 ms（快照源=avg 退化） |
| data_points[].p95_latency_ms | Number | P95 延迟 ms（快照源=avg 退化） |
| data_points[].p99_latency_ms | Number | P99 延迟 ms（快照源=avg 退化） |

> 旧端点 `GET /v1/monitor/routes/{id}/metrics` 保持不动（兼容），其 data_points 亦为上述 8 字段。

### 17.3 写端点限流护栏（P1-8）

四类高危写端点加 `@RateLimit(limit = 30, window = "1m", scope = "ip")`（分布式滑动窗口，Redis 计数；超限 HTTP 429 + `Retry-After`，信封码 10500 TOO_MANY_REQUESTS）：

- 导入类：`POST /v1/routes/import`、`/import/validate`、`/import/snapshot`、`/import/rollback`
- 批量类：`POST /v1/routes/bulk-publish`、`/bulk-offline`、`/bulk-delete`
- JAR 上传：`POST /v1/plugins/upload-jar`
- Groovy 校验：`POST /v1/plugins/validate-groovy`

> 30/min 而非 5/min 的理由：e2e 回归 15 分钟内会打这类端点约 10~20 次，5/min 会误伤回归；30/min 保留防滥用价值。
> 静态护栏脚本：`node scripts/check-write-guardrails.mjs`（CI 可挂）。

---

## 18. P2 新增契约（2026-10-29）

### 18.1 POST /v1/monitor/route-simulate（P2-6 路由模拟 Debug 工具第一阶）

Apigee Trace-lite：**只回答「这个请求会被谁接住、绑了什么插件」，不做真实转发**。
匹配语义与数据面 `DynamicRouteLocator` 逐字对齐：仅 `status=PUBLISHED` 路由参与；
路径谓词 `PathPatternParser.defaultInstance` 解析 `normalizePath(path)` 后 matches；
DISPATCH 排序在前（order = -1_000_000 + sort_order）、BACKEND 按 sort_order，取顺序
第一个命中。需 Bearer Token。

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| path | String | 是 | 模拟请求路径，如 `/api/user/1` |
| method | String | 否 | 回显用（当前 engine 路径谓词不区分方法），默认 GET |
| headers | Map<String,String> | 否 | DISPATCH HEADER 条件求值输入 |
| query | Map<String,String> | 否 | DISPATCH QUERY 条件求值输入 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| matched | Boolean | 是否有路由接住请求 |
| route | Object\|null | 命中路由 `{id, route_name, route_type, path, upstream_url}` |
| evaluated | Array | 按求值顺序逐路由 trace：`{route_id, route_name, route_type, matched, path_matched, reason}`。`matched`=实际接住（仅胜者 true）；`path_matched`=纯谓词结果；reason 说明落选/命中原因 |
| dispatch | Object | 仅命中 DISPATCH 时出现：`{conditions:[{condition_type, operator, condition_key, condition_value, priority, matched, reason, target_route_id, target_route_name, target_resolvable}], weight_candidates:[...], resolved_target:Object\|null}`。HEADER/QUERY/PATH 条件现场求值；**BODY/GROOVY 需真实请求上下文，Trace-lite 跳过并注明**；WEIGHT 非请求谓词仅列 `{weight}` 候选不掷点（resolved_target 保持 null）；S10 批新增的 HOST/METHOD/COOKIE/REMOTE_ADDR/AFTER/BEFORE/BETWEEN 亦为请求谓词（engine 侧已支持），管理面 Trace-lite 暂不现场求值，模拟器后续同步 |
| plugins | Object | 插件链装配预览：`{global_pre:[...], route:[...], global_post:[...]}`。route 段含命中路由的路由级绑定（DISPATCH 时合并目标子路由绑定）：`{plugin_id, plugin_name, plugin_type, plugin_phase, plugin_status, sort_order, binding_config, bound_route_id, bound_route_name}` |
| request | Object | 回显 `{path, method}` |

### 18.2 GET /v1/monitor/routes/status 行内 `upstream` 扩展（P2-6 上游主动探测第一阶）

见 §6.1 表格 `upstream` 行。探测由管理面 `@Scheduled` 每 **30s** 一轮（fixedDelay）对全部
PUBLISHED BACKEND 路由 `upstream_url` 发 **HEAD（5s 超时，失败 GET 兜底一次）**，结果写
Redis HASH `gateway4j:upstream:health`（field=route_id，value
`{"reachable":Boolean,"latency_ms":Number,"checked_at":Number(ms)}`，key TTL **90s**）。
可达口径：HTTP 应答 status < 500（含 3xx/4xx——服务在应答即可达）；连接拒绝/超时/5xx =
不可达。探测调度异常吞掉 + 限频日志（60s 一条），HASH 停摆后自动过期，行内退 null。

### 18.3 GET /v1/audit/logs（P2-6 变更记录升级，契约固定给前端系统设置-变更记录 Tab）

审计日志查询（`audit_log` 表，framework4j-audit JdbcAuditSink 落库，**只读**——写入方
是框架 Hash Chain append-only，管理面无写路径）。需 Bearer Token。

**请求参数**（全部可选）：

| 字段 | 类型 | 说明 |
|---|---|---|
| action | String | 等值过滤（如 CREATE_ROUTE） |
| actor | String | 等值过滤 |
| target | String | 对 target_id 模糊（like） |
| from / to | String | created_at 闭区间，`yyyy-MM-dd`（归一当日全天）或 ISO-8601 |
| page | Integer | 默认 1 |
| pageSize | Integer | 默认 20，上限 100 |

**响应**：统一 ApiResponse 信封，data 为全站分页形状（`data.records` / `data.total`，
排序 id 倒序）：

| 字段 | 类型 | 说明 |
|---|---|---|
| records[].id | String | **Long→String 契约**（全局 Jackson 序列化） |
| records[].action | String | 操作动作 |
| records[].target_type / target_id | String | 目标 |
| records[].actor | String | 操作人 |
| records[].result | String | SUCCESS/ERROR |
| records[].error_message / ip / trace_id | String | 补充信息 |
| records[].timestamp / created_at | String | ISO-8601 时间（timestamp=sink 操作时间，created_at=落库时间） |
| total / size / current / pages | Number | MyBatis-Plus Page 标准字段 |

### 18.4 GET /v1/monitor/stream（P2-7 监控指标 SSE）

`text/event-stream`（SseEmitter，timeout 0 不限时）。**事件两类**（事件名固定给
`EventSource.addEventListener`），data 均为 JSON 字符串：

| 事件 | 频率 | data |
|---|---|---|
| `metrics` | 每 5s 节流（+订阅建立后首个 5s 周期） | `{"routes_total":N,"error_count":N,"total_requests":N,"at":epoch_ms}`（口径同 /v1/monitor/routes/status：异常数=total>0 且 error_rate>0.05 的路由数） |
| `config_changed` | 挂既有 ConfigChangeEvent | `{"type":"route\|plugin\|global-plugin","at":epoch_ms}` |

**鉴权形态（与全站不同）**：EventSource 无法携带 Authorization 头，本端点**不加
@RequiresToken**，改用 `?token=<access_token>` 查询参数 + 手工校验（TokenUtils 验签 +
BEARER 类型 + jti 撤销检查 + Redis nonce 强一致，与拦截器同源收紧）；失败返回 HTTP 401 +
信封 10200。安全取舍：**token 进 URL 会进访问/代理日志**——本端点只读监控聚合指标，
泄露面小，且 token 短时效（2h）+ 可撤销；管理面内网场景可接受（生产可在反向代理层
过滤该路径 query-string 日志加强）。前端用法：
`new EventSource('/v1/monitor/stream?token=' + accessToken)`。

客户端断开/超时/群发异常由注册表自动踢除清理；广播永不抛出，不影响主流程。

### 18.5 OpenAPI 文档暴露（P2-3）

- `GET /v1/api-docs` 返回 OpenAPI 3.1 JSON（springdoc-openapi-starter-webmvc-ui
  2.8.9，对齐 Boot 3.5.x）；env 开关 `GATEWAY4J_API_DOCS_ENABLED`（默认 true）。
- swagger-ui 仅 dev：`springdoc.swagger-ui.enabled` 默认 **false**，env
  `GATEWAY4J_SWAGGER_UI_ENABLED=true` 开启后访问 `/v1/swagger-ui.html`。
- **安全取舍**：api-docs 会暴露接口清单——本管理面处于内网、全部业务端点仍需 Bearer
  Token（springdoc 端点无 @RequiresToken 注解，framework4j TokenInterceptor 为注解驱动，
  天然放行，无需额外白名单；rate-limit 拦截范围同样不含该路径），暴露面与 Kong Admin
  API 同级，内网管理面可接受。生产封闭环境可设
  `GATEWAY4J_API_DOCS_ENABLED=false` 一键关闭。

### 18.6 首启弱口令检测与改密端点（P2-9）

- 登录响应平铺追加 `password_stale`（见 §3.1）。检测口径：用户口令 hash 是否等于
  bcrypt(admin123)（出厂种子口令，V1.1.0/V1.3.4 种子迁移）。**非阻断**——不强制改密、
  不拦截任何流程，仅提示（阻断式会破坏既有 e2e 回归并把自动化部署的管理入口锁死）。
- **改密端点（已存在）**：`POST /v1/users/{id}/reset-password`（body
  `{new_password}`）或 `PATCH /v1/users/{id}`（body 带 `password` 字段），均走 admin
  权限（@RequiresToken BEARER）。前端弱口令横幅跳转用其一即可。
- secret 轮换语义：framework4j v1.10.1（gateway4j 现依赖版本）accesstoken 仍为**单 key
  HS256，无 kid / 多 key 验签，无双 key 过渡配置**，轮换 = 替换 env + 重启 = 全量登出
  （v1.2.1 → v1.10.1 期间该语义未变，经 v1.10.1 源码逐条复核；refresh token 同 key 验签，
  换 key 连 refresh 一并失效），详见 `docs/SECRET_ROTATION.md`。
- 凭证已全部外部化（本地栈不设 env 用默认值原样启动）：
  `GATEWAY4J_DB_PASSWORD` / `GATEWAY4J_JWT_SECRET` / `GATEWAY4J_JWT_HASH_SALT` /
  `GATEWAY4J_OPEN_API_SECRET`（另有 DB/Redis 主机端口与 Prometheus 地址可选 env）。

### 18.7 P2-2 多环境配套契约（2026-10-29，H7b）

多环境基础（`environment` 字段落库 V1.4.1、engine 按 `gateway4j.env` 过滤装载、
创建/PATCH/列表/导入导出/复制携带 `environment`，缺省归一 `default`，
同环境内 `route_name` 唯一）由 P2-2 落地；本节补齐配套查询契约。

#### GET /v1/routes/environment-diff（P2-5 环境间 diff）

对比两个环境中同名路由的配置差异，`route_name` 为对齐键。需 Bearer Token。

**请求参数**（均必填）：

| 字段 | 类型 | 说明 |
|---|---|---|
| from | String | 源环境标识（`^[a-z0-9_-]{1,20}$`） |
| to | String | 目标环境标识 |

**响应 data**：

| 字段 | 类型 | 说明 |
|---|---|---|
| from / to | String | 回显环境标识（trim 后） |
| only_in_from | Array | 仅 from 环境存在：`{id, route_name, environment, route_type, path, upstream_url, status, sort_order, remark}`（id 为 String 契约） |
| only_in_to | Array | 仅 to 环境存在，结构同上 |
| changed | Array | 同名但字段不同：`{route_name, fields:{<field>:{from,to}}}` |

逐字段比对字段集：`path` / `upstream_url` / `status` / `sort_order` / `remark`
（null sort_order 按 0、null remark 按空串归一后比对；`environment` 因两侧环境不同不参与）。

**错误口径**：环境标识缺失/非法白名单、或该环境在 `gw_route` 无任何路由（环境不存在）→
信封 `10605 CONFIG_SYNC_FAILED`（本管理面业务错误统一 HTTP 200 + 失败信封，
非 HTTP 400，见 AdminGlobalExceptionHandler 口径）。

#### GET /v1/environments（环境清单，给顶栏环境切换器）

**响应 data**：`{"environments": ["default", "staging", ...]}`
—— `gw_route` distinct `environment`（逻辑删除行排除）+ 保证含 `default`（空库也返回
`["default"]`）；排序 `default` 优先、其余字母序。需 Bearer Token。

#### POST /v1/routes/bulk-publish 可选 change_description（P2-4 流程档轻量）

批量发布请求体扩展为 `{ids: [...], change_description?: "..."}`，**UI 侧必填、API 侧
可选**（旧两参/无 description 调用兼容）。携带时随审计切面写入审计行 `args_json`
（审计 `action` 仍为 `BULK_PUBLISH_ROUTES`）。单条 publish 同口径见 §4.5。

#### T1 修复：PATCH 不再静默重置 status（既有缺陷）

见 §4.3 补注。回归口径：OFFLINE 路由 `PATCH {remark}` → `status` 仍 OFFLINE、
`sort_order`/`tags`/`config_version` 不动；PUBLISHED 路由 PATCH 仍被禁改保护拒绝（不变）。

---

## 19. S12 路由创建改造批契约（SCG 1:1 形态，V1.8.0 / 2026-11-23）

> 背景与用户裁决见 `docs/ui-v2/实施契约.md` §10（用户指令：「路由创建要 100% Spring Cloud
> Gateway 对齐」→「**要 spring gateway 1:1 对应填写**」）。
>
> **最终形态**：路由创建 = **纯 Spring Cloud Gateway `RouteDefinition` 1:1** ——
> 一条路由 = 一条 SCG 路由定义（`uri` + `predicates[]` + `filters[]` + `order` + `metadata`）；
> 前端表单是「SCG 路由列表编辑器」，YAML 视图是**可直接粘回 SCG 配置文件**的
> `RouteDefinition` YAML。
>
> **实现状态**：S12-7a 引擎侧已落地（aa40cc7：`gw_route_filter` 表 + `gw_route.metadata`
> JSONB 列 + SCG filter 绑定挂载 + metadata 透传）；**S12-7b 管理面批量 API 已落地**
> （`POST /v1/routes/batch` 正式可用，`POST /v1/routes/ingress` 已删除）；**S12-7c 前端已落地**
> （bcad5ca：`/v2/routes/new` = `ScgRoutesForm.vue` 纯 SCG 路由列表编辑器，表单 ⇄ YAML 双视图，
> 提交消费 `POST /v1/routes/batch`——UI 消费端已整体切换，旧 K8s Ingress 形态的前端代码
> （`ingressModel.ts` / `IngressForm.vue` 及其 E2E `03-routes-ingress.spec.ts`）已随之删除，
> 无残留消费方）。引擎语义以本节为准。

### 19.1 批量建路由 POST /v1/routes/batch

一次性落成 N 条路由（**整个请求一个事务**，中途失败全量回滚，不留半成品路由）。
需 Bearer Token。

#### 19.1.0 端点更名与废弃（⚠️ 破坏性变更）

| 端点 | 状态 |
|---|---|
| `POST /v1/routes/batch` | ✅ **本批正式端点**（SCG `RouteDefinition` 1:1 形态） |
| `POST /v1/routes/ingress` | ⛔ **已删除（S12-7b）**（K8s Ingress 形态：`rules[]` / `paths[]` / `backend{service,port}` / `pathType`）。SCG 形态与 K8s 形态并存 = **双真相源** → 直接删除，不留兼容分支。该端点 2026-11-23 由 S12-3 落库、**仅本 UI 消费、无外部调用方**，删除无迁移成本；后端 `RouteIngressService` 与 `RouteController.IngressCreateRequest` 等 Ingress 嵌套 record 已一并移除，S12-3 的 ingress 测试已改造为 batch 测试（`RouteBatchServiceTest`） |

> K8s 形态的能力（host × path 的笛卡尔展开、pathType 三值映射）在 SCG 1:1 形态下
> **由用户自己在 `predicates[]` 里逐条写**（`Host=api.example.com` + `Path=/api/**`），
> 服务端不再替用户做展开决策 —— 1:1 的核心就是「所见即 SCG 配置」。

#### 19.1.1 请求体

顶层字段（未知字段**忽略**，不报错）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| routes | Array | 是 | 路由列表，**非空**；顺序即落库顺序 |

`routes[]` 单项（= 一条 SCG `RouteDefinition`）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | String | 是 | 路由名，须合 `^[a-zA-Z0-9_]{2,50}$`（与 §4.2 一致）；**不再自动追加序号后缀** —— 1:1 形态下路由名由用户自己给，服务端不合成 |
| uri | String | 是 | 上游地址：**完整 URL** `scheme://host[:port]`，须合 `^https?://\S+$`（与 §4.2 的 `upstream_url` 同一条正则）。与 SCG `RouteDefinition.uri` **同名同义** |
| predicates | Array&lt;String&gt; | 否 | SCG 原生**谓词**定义串列表（`Path=/api/**`、`Host=api.example.com`…）；语法与失败语义见 §19.2 |
| filters | Array&lt;String&gt; | 否 | SCG 原生**过滤器**定义串列表（`AddRequestHeader=X-Foo, bar`…）；语法与失败语义见 §19.2 |
| order | Integer | 否 | 排序号 → `gw_route.sort_order`；与 SCG `RouteDefinition.order` 同名同义 |
| metadata | Object | 否 | 自由元数据（任意键值对）→ `gw_route.metadata`（JSONB） |
| environment | String | 否 | 环境标识，须合 `^[a-z0-9_-]{1,20}$`；缺省 `default`（口径同 §4.2） |
| remark | String | 否 | 备注，最长 200 字符 |
| tags | String | 否 | 标签，最长 200 字符 |

请求示例：

```json
{
  "routes": [
    {
      "name": "api_gateway_1",
      "uri": "http://user-service:8080",
      "predicates": ["Path=/api/**", "Host=api.example.com"],
      "filters": ["AddRequestHeader=X-Foo, bar"],
      "order": 10,
      "metadata": { "team": "core" },
      "environment": "default",
      "remark": "",
      "tags": ""
    }
  ]
}
```

#### 19.1.2 响应体

`data.created[]` = 本次批量创建成功的路由清单（顺序同 `routes`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| created | Array | 创建结果列表 |
| created[].route_id | String | 新建路由 ID（雪花 ID → String 契约） |
| created[].route_name | String | 路由名（原样取自请求 `name`） |
| created[].uri | String | 上游地址（原样取自请求 `uri`） |
| created[].path | String | 落库的路径（= 抽取出的 `Path=` 谓词值；无 Path 谓词时为 null） |
| created[].predicates_count | Integer | 该路由落库的**谓词行数**（不含被抽取走的 `Path=`） |
| created[].filters_count | Integer | 该路由落库的**filter 行数** |

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {
    "created": [
      {
        "route_id": "2124846057075699714",
        "route_name": "api_gateway_1",
        "uri": "http://user-service:8080",
        "path": "/api/**",
        "predicates_count": 1,
        "filters_count": 1
      }
    ]
  },
  "trace_id": "756c897a-8c50-4e16-b534-1ecf4b3ee37b",
  "timestamp": "1795437752449",
  "fail": false,
  "success": true
}
```

#### 19.1.3 落库映射（请求字段 → 表）

| 请求字段 | 落库位置 | 口径 |
|---|---|---|
| `name` | `gw_route.route_name` | 原样（**不合成、不加序号**） |
| `uri` | `gw_route.upstream_url` | 原样（**不合成、不补 scheme、不去尾斜杠**） |
| `predicates[]` 中的 **`Path=`** | `gw_route.path` | **抽取**：Path 谓词被抽出落 path 列（SCG 注册层由 path 生成唯一 Path 谓词），**不再**另落 `gw_route_predicate` 行 |
| `predicates[]` 其余条目 | `gw_route_predicate.definition` | 逐条落一行（`sort_order` 从 0 递增），定义串原样 |
| `filters[]` | `gw_route_filter.definition` | 逐条落一行（`sort_order` 从 0 递增），定义串原样 |
| `order` | `gw_route.sort_order` | 原样（缺省 0） |
| `metadata` | `gw_route.metadata`（JSONB） | 原样（缺省 `{}`） |
| `environment` / `remark` / `tags` | 同名列 | 原样（environment 缺省 `default`） |
| —— | `gw_route.route_type` | 一律 `BACKEND`（本端点只建普通路由，不建 DISPATCH 父路由） |
| —— | `gw_route.status` | 一律 **`DRAFT`** —— 需另行调用 `POST /v1/routes/{id}/publish` 才在网关生效（与 §4.2 一致） |

> **单一真相源**：请求体**不接受** `upstream_url`（未知字段忽略）—— 上游地址只由 `uri` 表达。
> 前端若再自带一份 `upstream_url`，两个真相源一旦分叉即静默不一致。

#### 19.1.4 Path 谓词唯一性限制（拒收口径）

`gw_route.path` 是**单列**，SCG 注册层由该列生成**唯一**的 Path 谓词 → 一条路由只允许
**一个** `Path=` 谓词：

| 情形 | 处理 |
|---|---|
| `predicates[]` 含**多个** `Path=` 条目 | ⛔ **拒收**（HTTP 200 + 失败信封，`10100`）—— 数据模型无法承载多个 Path 谓词 |
| 单个 `Path=` 内用逗号写多 pattern（`Path=/a,/b`） | ⛔ **拒收**（`10100`）—— 本端点不暴露多 pattern 形态（SCG 原生虽支持 GATHER_LIST，本数据模型是单值） |
| `predicates[]` **没有** `Path=` 条目 | ✅ 允许 —— `gw_route.path` 落 `null`（该路由不限路径，SCG 原生语义）。**注意**：这与 §4.2 单条创建「后置路由 path 必填」的约定不同（批量端点按 SCG 1:1 语义，不强加 path 必填） |
| `Path=` 值非法（如不以 `/` 开头、含空白） | ⛔ **拒收**（`10100`）—— path 列的既有校验口径 |

#### 19.1.5 错误码

| 错误码 | 触发条件 | 说明 |
|---|---|---|
| `10100`（`FORMAT_INVALID` / `REQUIRED_MISSING`） | 字段级校验失败 | 如 `name` 不合正则、`routes` 为空、`uri` 为空或不合 `^https?://\S+$`（文案点明「须为 http:// 或 https:// 开头的完整上游地址」）、`Path=` 值非法、`environment` 非法白名单、**多个 `Path=` 谓词** |
| `10609` `ROUTE_NAME_CONFLICT` | **同环境内**路由名已存在 | 预检式拒收，message 给出冲突的路由名；**整单不落库** |
| `10605` `CONFIG_SYNC_FAILED` | 业务级校验失败（路由落库失败等） | message 带具体原因 |

> **码值唯一性**：`10402` 已被 `ROUTE_VERSION_CONFLICT` 占用且跨模块契约，故新码取
> `10609`（`ErrorCodeTest` 强制码值唯一）。

#### 19.1.6 事务与副作用

- **整个请求一个事务**（`@Transactional`）：N 条路由 + 谓词行 + filter 行要么全成，要么全回滚。
- **配置变更事件整批只发 1 条**（`ConfigChangeEvent`，`AFTER_COMMIT` 广播）—— 逐条发会触发
  N 次网关全量重载。
- **审计**：`action = CREATE_ROUTES_BATCH`，`targetType = ROUTE`（framework4j `@Auditable`）。
- **幂等**：未接 `Idempotency-Key`（admin 模块现无先例）；重名预检（`10609`）承担去重兜底。

### 19.2 路由级 SCG 谓词 / filter 定义串

每条路由可挂若干条 **SCG 原生定义串**：谓词落 `gw_route_predicate`（见
`docs/DATABASE_DESIGN.md` §5.15），过滤器落 `gw_route_filter`（§5.16）。
引擎注册路由时用 **SCG 自己的 `RoutePredicateFactory` + `ConfigurationService`** 绑定，
并与该路由的 Path 谓词 **AND 组合**（`AsyncPredicate.and`，与 SCG
`RouteDefinitionRouteLocator` 的多谓词 AND 同款）→ **路由准入语义由构造保证 100% 对齐**，
gateway4j 不实现任何一条匹配规则。

#### 19.2.1 定义串语法

```
<名字>=<参数>[,<参数>...]
```

- 解析器 = SCG 自己的 `PredicateDefinition` / `FilterDefinition`（与 SCG YAML
  `predicates:` / `filters:` 同款解析器）；参数按逗号切分，再由各工厂的
  `ShortcutType`（`GATHER_LIST` / `DEFAULT`）归一化。
- 名字**大小写敏感**（须与 SCG `RoutePredicateFactory#name()` /
  `GatewayFilterFactory#name()` 完全一致）。
- 值的引号/转义：沿用 SCG 原生口径。

#### 19.2.2 支持谓词清单（10 种）

| 谓词名 | 参数形态 | 对应 SCG 工厂 | 语义（由 SCG 决定） |
|---|---|---|---|
| `Host` | `patterns`（1 个或多个，逗号分隔） | `HostRoutePredicateFactory` | Host 头 Ant 风格匹配；`**` 口径**能匹配裸域**（`**.example.com` 命中 `example.com`） |
| `Method` | `methods`（多值） | `MethodRoutePredicateFactory` | HTTP 方法**多值**且**大小写敏感**（`HttpMethod` 枚举） |
| `Cookie` | `name,regexp` | `CookieRoutePredicateFactory` | Cookie 名 + 正则；**全串 matches**（非子串 find） |
| `Header` | `header,regexp` | `HeaderRoutePredicateFactory` | 请求头名 + 正则；SCG 遍历**全部**同名头值 |
| `Query` | `param,regexp` | `QueryRoutePredicateFactory` | 查询参数名 + 正则 |
| `RemoteAddr` | `source`（CIDR） | `RemoteAddrRoutePredicateFactory` | `IpSubnetFilterRule` 口径的 IP/CIDR 前缀比较 |
| `XForwardedRemoteAddr` | `source`（CIDR） | `XForwardedRemoteAddrRoutePredicateFactory` | 同上，但取 `X-Forwarded-For` 链路的首个地址 |
| `After` | `datetime` | `AfterRoutePredicateFactory` | 请求时刻**晚于**该时刻命中（ISO-8601 带时区偏移，或 epoch 毫秒） |
| `Before` | `datetime` | `BeforeRoutePredicateFactory` | 请求时刻**早于**该时刻命中 |
| `Between` | `datetime1,datetime2` | `BetweenRoutePredicateFactory` | 请求时刻落在该区间命中 |

**不在支持清单**：

| 谓词 | 原因 |
|---|---|
| `Path` | 路由自身的 `gw_route.path` 列**已经是** Path 谓词（尾斜杠口径由 S12-2 统一）；重复声明会歧义 → 批量端点把 `Path=` **抽取**到 path 列（§19.1.3） |
| `ReadBody` / `Weight` / `CloudFoundry` | 需要额外装配（请求体缓存 / 权重组 / CF 环境），不在本批范围 |
| `GROOVY` / `BETWEEN` / `WEIGHT`（gateway4j 条件类型） | **SCG 无等价物**（BODY 机制异构：SCG 仅 Java API，gw4j 走 JsonPath）→ 保留为 gateway4j **扩展谓词**（`gw_route_condition`），UI 标注「扩展（非 SCG 标准）」 |

> `Between`（SCG 路由级谓词，两端**闭**区间）与 `gw_route_condition.BETWEEN`（扩展条件，
> 左闭右**开** `[start,end)`）语义不同 —— 两者并存但**不是同一个东西**，勿混用。

#### 19.2.3 filter 定义串

- **语法同谓词**：`Name=args,...`，如 `AddRequestHeader=X-Foo, bar`。
- SCG 标准 `GatewayFilterFactory` 集合（4.3.1）含 `AddRequestHeader` /
  `AddResponseHeader` / `RemoveRequestHeader` / `RemoveResponseHeader` / `SetStatus` /
  `RewritePath` / `SetPath` / `PrefixPath` / `RedirectTo` / `ModifyRequestBody` /
  `ModifyResponseBody` / `RequestRateLimiter` / `CircuitBreaker` / `Retry` /
  `RequestSize` / `PreserveHost` 等。
- **本批固定的只是线格式与存储口径**：定义串**原样**落 `gw_route_filter.definition`
  （逐条一行）。**引擎侧逐条绑定执行已由 S12-7a 落地**（aa40cc7：复刻 SCG
  `RouteDefinitionRouteLocator`，定义串 → `GatewayFilterFactory.apply` →
  `OrderedGatewayFilter` 挂 `Route.gatewayFilters`；未知名跳过 / 已知名坏参恒不放行，
  见 §19.2.4；gateway4j 另有自己的插件链，SCG filter 与 gateway4j 插件的对应关系
  不在本节范围）。

#### 19.2.4 失败语义（fail-closed 口径，两类分流）

配置写错**绝不放宽准入条件**。两类失败处理不同：

| 失败类型 | 例子 | 处理 | 理由 |
|---|---|---|---|
| **格式非法 / 未知名字** | `Foo=bar`、`=bar`、名字拼错、语法不可解析 | **跳过该条 + WARN**（同路由其余谓词/filter 照常生效） | 多半是版本/拼写问题；一条脏数据不废掉整条路由的其余条目 |
| **已知名字但缺必填参数 / 参数值非法** | `Cookie=session`（缺 regexp）、`Host`（无 `=`）、`Method=`（空值）、`After=not-a-date` | **该条恒不匹配 + WARN** → AND 链短路 → **整条路由永不被匹配** | 与 SCG「shortcut 绑定失败 → 整条路由加载失败 → 不注册 → 永不匹配」**效果等价**；保留 gateway4j 的网关级 fail-safe（不炸网关、不影响其它路由） |

**SpEL 显式拒绝**：定义串来自数据库，参数值以 `#{` 开头（SpEL 表达式）→ 判为
**该条恒不匹配 + WARN**（fail-closed），**绝不在服务端求值 SpEL**。

**表未建出时**：降级为「无谓词 / 无 filter」并 WARN（fail-safe，不炸网关）。

> **与 §4.2 `conditions` 的关系**：`gw_route_condition` 是 **DISPATCH 分发层的扩展编排**
> （OR 语义、首个命中即止、gateway4j 自研算子）；`gw_route_predicate` 是
> **路由准入层的 SCG 原生谓词**（AND 语义、SCG 工厂判定）。两者**互不替代**：
> 前者决定「分发到哪个子路由」，后者决定「这条路由本身接不接这个请求」。

### 19.3 pathType 与 SCG PathPattern 语法对照（参考）

K8s `pathType` → SCG `Path=` 谓词值的对照（**1:1 形态下由用户自己写 Path 谓词**，
本表给出「K8s 语义 → SCG PathPattern 语法」的换算参考）：

| K8s pathType | K8s 语义 | 对应 SCG PathPattern | 命中口径 |
|---|---|---|---|
| `Prefix` | 前缀匹配（`/api` 命中 `/api` 与 `/api/...`） | `Path=/api/**` | 零段匹配：`/api`、`/api/`、`/api/a/b` 全中 |
| `Exact` | 精确匹配 | `Path=/exact` | 仅 `/exact`（尾斜杠按 SCG `matchTrailingSlash=true` 与 `/exact/` 等价） |
| `ImplementationSpecific` | 由实现方自定义 | `Path=/api/{id:[0-9]+}` | PathPattern 变量段 + 正则约束；`/api/123` 中、`/api/abc` 不中 |

**PathPattern 语法速查**（SCG `PathPatternParser`，S12-2 起三处共用同一份实现）：

| 语法 | 含义 | 例 |
|---|---|---|
| `{name}` | 变量段（匹配任意单段） | `/seg/{id}` 命中 `/seg/123` 与 `/seg/abc` |
| `{name:regex}` | 变量段 + 正则约束 | `/segn/{id:[0-9]+}` 只命中数字段 |
| `**` | 跨段通配（任意深度，含零段） | `/api/**` |
| `*` | 单段通配 | `/api/*` |

> **S12-2 修复的历史坑**：修复前 gateway4j 分发层按**字面全等**比对路径，`/seg/{id}`
> 这类变量段路由在分发层匹配不到 → **静默 404**（SCG 注册层却能匹配）。现已统一为
> PathPattern 语义，并显式化仲裁顺序（精确优先 → DISPATCH 优先 → 注册顺序）。
