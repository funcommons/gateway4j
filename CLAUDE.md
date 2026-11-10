# CLAUDE.md

## 项目概述

可视化网关（gateway4j）— 基于 Spring Cloud Gateway 的 HTTP 网关平台，提供流程图式路由编排、插件化过滤器体系、多层分发路由决策。

## 技术栈

- **后端**：Java 17、Spring Boot 3.5.16、Spring Cloud Gateway 4.3.1、framework4j v1.10.1、MyBatis-Plus、PostgreSQL 16+、Groovy 4.0
- **基础框架**：framework4j v1.10.1（鉴权/签名/限流/缓存/审计/脱敏/幂等/ID/多Redis/多DataSource/ApiResponse）
- **前端**：Vue 3、TypeScript、Element Plus、Vue Flow、Pinia、ECharts
- **监控**：Micrometer + Prometheus
- **构建**：Maven（后端）、Vite（前端）

## 项目结构

```
gateway4j/                    根 POM
├── gateway4j-gateway-boot/   网关启动模块（Reactive/Netty，端口 9300）
├── gateway4j-admin-boot/     管理后台启动模块（Servlet/Tomcat，端口 9301）
├── gateway4j-engine/         网关引擎核心（路由决策、插件链、配置中心）
├── gateway4j-plugin-api/     插件 SDK 接口
├── gateway4j-plugin-builtins/ 内置插件（安全/缓存/限流/共享/日志/跟踪）
├── gateway4j-admin/          管理后台 REST API（Service/Mapper/Controller）
├── gateway4j-common/         公共模块（实体/常量/异常/工具）
├── gateway4j-admin-ui/       Vue 3 前端（端口 9302，proxy → 9301）
├── docs/                     文档
│   └── adr/                 架构决策记录
└── sql/                      数据库脚本
```

## 构建命令

```bash
# 后端全量构建
mvn clean package -DskipTests

# 后端单模块构建（含依赖模块）
mvn clean package -pl gateway4j-gateway-boot -am -DskipTests
mvn clean package -pl gateway4j-admin-boot -am -DskipTests

# 网关服务运行（Reactive/Netty，端口 9300）
java -jar gateway4j-gateway-boot/target/gateway4j-gateway-boot.jar

# 管理后台运行（Servlet/Tomcat，端口 9301）
java -jar gateway4j-admin-boot/target/gateway4j-admin-boot.jar

# 前端开发（端口 9302，proxy → admin-boot 9301）
cd gateway4j-admin-ui && npm run dev

# 前端构建
cd gateway4j-admin-ui && npm run build
```

## 代码规范

- 包名：`fun.commons.gateway4j.<module>.<layer>`
- 实体类字段使用数据库列名 snake_case 映射
- 状态字段使用 VARCHAR(20) 字典值，不用数字
- 插件必须实现 `GatewayPlugin` 接口（gateway4j-plugin-api 模块）
- 插件间通过 `PluginContext`（ServerWebExchange attributes 封装）传递数据，禁止直接引用
- JAR 插件使用独立 ClassLoader，Groovy 插件运行于沙箱
- 写操作必须支持幂等（framework4j-idempotency: Idempotency-Key Header）
- 管理后台接口使用 `@RequiresToken` 保护（framework4j-accesstoken）
- 统一响应格式使用 `ApiResponse`（framework4j-web + framework4j-api）
- 错误码使用 `ApiCode`（framework4j-api）
- 路由/插件配置缓存使用 `CacheService`（framework4j-cache）
- 敏感配置加密使用 `EncryptedFieldTypeHandler`（framework4j-sensitive）
- 审计日志使用 `@Auditable`（framework4j-audit）
- 分布式 ID 使用 `SnowflakeDistributor`（framework4j-id）
- 异常统一通过 `BusinessException` + 错误码处理

## 核心概念

- **分发路由**：不指向后端服务，根据条件分发到不同后置路由，支持嵌套（最大 5 层）
- **后置路由**：指向实际后端服务，必须跟在分发路由后面
- **插件链**：全局前置 → 路由前置 → 转发 → 路由后置 → 全局后置
- **配置热更新**：数据库持久化 + WebSocket 推送 + Caffeine 本地缓存

## 文档索引

| 文档 | 路径 |
|---|---|
| PRD | PRODUCT.md |
| 技术方案 | docs/TECHNICAL_DESIGN.md |
| 数据库设计 | docs/DATABASE_DESIGN.md |
| API 契约 | docs/API_CONTRACT.md |
| 项目结构 | docs/PROJECT_STRUCTURE.md |
| ADR-001 SCG 选型 | docs/adr/ADR-001-spring-cloud-gateway-as-base.md |
| ADR-002 WebSocket 推送 | docs/adr/ADR-002-websocket-config-sync.md |
| ADR-003 JAR ClassLoader | docs/adr/ADR-003-jar-plugin-classloader.md |
| Flyway 初始迁移 | gateway4j-admin-boot/src/main/resources/db/migration/V1.0.0__init_schema.sql |
