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
| 10402 | 状态冲突（如删除已发布路由） | `STATE_CONFLICT` |
| 10500 | 请求限流 | - |
| 10501 | 重复提交 | - |
| 10600 | JAR 插件校验失败 | `PLUGIN_VALIDATION_FAILED` |
| 10601 | Groovy 脚本编译失败 | `SCRIPT_COMPILE_FAILED` |
| 10602 | 插件未实现 SDK 接口 | `PLUGIN_SDK_VIOLATION` |
| 10603 | 路由循环引用 | `CYCLIC_REFERENCE` |
| 10604 | 分发路由嵌套超限 | `DEPTH_EXCEEDED` |
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
| condition_type | String | 是 | HEADER/PATH/QUERY/BODY/GROOVY |
| operator | String | 是 | EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT |
| condition_key | String | 否 | 条件键 |
| condition_value | String | 否 | 条件值 |
| target_route_id | String | 是 | 匹配后跳转的路由 ID |
| priority | Integer | 否 | 优先级，默认 0 |

> **条件必填规则**：HEADER/PATH/QUERY/BODY 类型 + EQ/NE/CONTAINS/REGEX/GT/LT 运算符时，condition_key 和 condition_value 均必填；EXISTS 运算符可省略 condition_value；GROOVY 类型可省略 condition_key。

**响应 data**：路由对象

### 4.3 PATCH /v1/routes/{id}

修改路由。**需携带 Idempotency-Key**

**请求**：同创建，所有字段可选

**响应 data**：路由对象

### 4.4 DELETE /v1/routes/{id}

删除路由（仅 DRAFT/OFFLINE 状态可删除）。**需携带 Idempotency-Key**

**响应 data**：null

### 4.5 POST /v1/routes/{id}/publish

发布路由。**需携带 Idempotency-Key**

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
| script_content | String | 条件必填 | GROOVY 类型时必填 |

**响应 data**：插件对象

### 5.3 PATCH /v1/plugins/{id}

修改插件。**需携带 Idempotency-Key**

**请求**：同创建，所有字段可选

**响应 data**：插件对象

### 5.4 DELETE /v1/plugins/{id}

删除插件（仅 DISABLED/UNINSTALLED 状态可删除，BUILTIN 不可删除）。**需携带 Idempotency-Key**

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
| data_points[].timestamp | Long | 时间戳 |
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
| condition_type | String | 是 | HEADER/PATH/QUERY/BODY/GROOVY |
| operator | String | 是 | EQ/NE/CONTAINS/REGEX/EXISTS/GT/LT |
| condition_key | String | 否 | 条件键 |
| condition_value | String | 否 | 条件值 |
| target_route_id | String | 是 | 匹配后跳转的路由 ID |
| priority | Integer | 否 | 优先级，默认 0 |

**响应 data**：条件对象（含生成的 id）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 条件 ID |
| route_id | String | 所属路由 ID |
| condition_type | String | 条件类型 |
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
| 安全水印 | watermark | POST | HTML 响应注入水印 JS（</body> 前），移除 CSP 头 |
