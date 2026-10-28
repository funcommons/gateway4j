# 可视化网关 - 项目结构规划 V1.0.0

## 1. 基础信息

| 项 | 值 |
|---|---|
| 项目名称 | 可视化网关（gateway4j） |
| 关联文档 | TECHNICAL_DESIGN.md（技术方案） |

---

## 2. Maven 模块结构

```
gateway4j/                                    # 根 POM（packaging=pom）
├── pom.xml                                   # 父工程：依赖管理、仓库、插件
├── gateway4j-server/                         # 启动模块（packaging=jar）
│   ├── pom.xml
│   └── src/main/
│       ├── java/fun/commons/gateway4j/server/
│       │   └── Gateway4jServerApplication.java
│       └── resources/
│           ├── application.yml
│           ├── application-dev.yml
│           ├── application-prod.yml
│           └── log4j2.xml
│
├── gateway4j-engine/                         # 网关引擎核心（packaging=jar）
│   ├── pom.xml
│   └── src/main/java/fun/commons/gateway4j/engine/
│       ├── config/                           # 引擎自动配置
│       │   ├── EngineAutoConfiguration.java
│       │   └── EngineProperties.java
│       ├── handler/                          # WebHandler 入口
│       │   └── GatewayWebHandler.java
│       ├── route/                            # 路由决策
│       │   ├── model/                        # 路由模型
│       │   │   ├── RouteConfig.java
│       │   │   ├── RouteType.java
│       │   │   ├── RouteStatus.java
│       │   │   └── Condition.java
│       │   ├── matcher/                      # 路径匹配
│       │   │   └── RoutePathMatcher.java
│       │   ├── dispatcher/                   # 分发路由决策
│       │   │   └── RouteDispatcher.java
│       │   └── validator/                    # 循环检测/深度校验
│       │       └── RouteValidator.java
│       ├── plugin/                           # 插件体系
│       │   ├── chain/                        # 插件链
│       │   │   ├── PluginChain.java
│       │   │   ├── DefaultPluginChain.java
│       │   │   └── PluginChainFactory.java
│       │   ├── loader/                       # 插件加载器
│       │   │   ├── JarPluginLoader.java
│       │   │   ├── GroovyPluginFactory.java
│       │   │   └── BuiltinPluginRegistry.java
│       │   ├── sandbox/                      # Groovy 沙箱
│       │   │   └── GroovySandbox.java
│       │   └── group/                        # 分组插件
│       │       └── GroupPlugin.java
│       ├── config/                           # 配置中心
│       │   ├── ConfigService.java
│       │   ├── ConfigPushService.java
│       │   ├── cache/                        # Caffeine 缓存
│       │   │   └── RouteConfigCache.java
│       │   └── event/                        # 配置变更事件
│       │       ├── ConfigChangeEvent.java
│       │       └── ConfigChangeListener.java
│       └── monitor/                          # 监控指标
│           └── GatewayMetrics.java
│
├── gateway4j-plugin-api/                     # 插件 SDK 接口（packaging=jar）
│   ├── pom.xml
│   └── src/main/java/fun/commons/gateway4j/plugin/api/
│       ├── GatewayPlugin.java                # 插件接口
│       ├── PluginChain.java                  # 插件链接口
│       ├── PluginConfig.java                 # 插件配置
│       ├── PluginPhase.java                  # 执行阶段枚举
│       ├── PluginType.java                   # 插件类型枚举
│       ├── PluginContext.java                # 插件上下文（exchange attributes 封装）
│       └── AbstractGatewayPlugin.java        # 插件基类
│
├── gateway4j-plugin-builtins/                # 内置插件集合（packaging=jar）
│   ├── pom.xml
│   └── src/main/java/fun/commons/gateway4j/plugin/builtins/
│       ├── security/                         # 安全插件
│       │   ├── SecurityPlugin.java
│       │   └── SecurityPluginConfig.java
│       ├── cache/                            # 缓存插件
│       │   ├── CachePlugin.java
│       │   └── CachePluginConfig.java
│       ├── ratelimit/                        # 限流插件
│       │   ├── RateLimitPlugin.java
│       │   └── RateLimitPluginConfig.java
│       ├── sharing/                          # 共享插件
│       │   ├── SharingPlugin.java
│       │   └── SharingPluginConfig.java
│       ├── logging/                          # 日志插件
│       │   ├── LoggingPlugin.java
│       │   └── LoggingPluginConfig.java
│       └── tracing/                          # 跟踪插件
│           ├── TracingPlugin.java
│           └── TracingPluginConfig.java
│
├── gateway4j-admin/                          # 管理后台 API（packaging=jar）
│   ├── pom.xml
│   └── src/main/java/fun/commons/gateway4j/admin/
│       ├── controller/                       # REST Controller
│       │   ├── AuthController.java
│       │   ├── RouteController.java
│       │   ├── PluginController.java
│       │   ├── MonitorController.java
│       │   ├── UserController.java
│       │   ├── RoleController.java
│       │   └── DictController.java
│       ├── service/                          # 业务逻辑
│       │   ├── AuthService.java
│       │   ├── RouteService.java
│       │   ├── PluginService.java
│       │   ├── MonitorService.java
│       │   ├── UserService.java
│       │   └── ConfigPushService.java
│       ├── mapper/                           # MyBatis Mapper
│       │   ├── RouteMapper.java
│       │   ├── PluginMapper.java
│       │   ├── UserMapper.java
│       │   └── ...
│       └── dto/                              # 请求/响应 DTO
│           ├── request/
│           │   ├── RouteCreateRequest.java
│           │   ├── RouteUpdateRequest.java
│           │   ├── PluginCreateRequest.java
│           │   └── ...
│           └── response/
│               ├── RouteResponse.java
│               ├── PluginResponse.java
│               └── ...
│
├── gateway4j-common/                         # 公共模块（packaging=jar）
│   ├── pom.xml
│   └── src/main/java/fun/commons/gateway4j/common/
│       ├── model/                            # 数据库实体
│       │   ├── Route.java
│       │   ├── RouteCondition.java
│       │   ├── Plugin.java
│       │   ├── PluginJar.java
│       │   ├── PluginGroovy.java
│       │   ├── PluginGroupItem.java
│       │   ├── RoutePluginBinding.java
│       │   ├── RouteCanvas.java
│       │   ├── ConfigPushLog.java
│       │   ├── User.java
│       │   ├── Role.java
│       │   ├── UserRole.java
│       │   ├── Permission.java
│       │   └── RolePermission.java
│       ├── constant/                         # 常量/字典
│       │   ├── RouteType.java
│       │   ├── RouteStatus.java
│       │   ├── PluginType.java
│       │   ├── PluginPhase.java
│       │   ├── PluginScope.java
│       │   ├── PluginStatus.java
│       │   ├── ConditionType.java
│       │   └── ErrorCode.java
│       ├── exception/                        # 异常定义
│       │   ├── BusinessException.java
│       │   ├── RouteCyclicException.java
│       │   ├── PluginLoadException.java
│       │   └── GroovyCompileException.java
│       └── util/                             # 工具类
│           ├── JsonUtils.java
│           ├── AesUtils.java
│           └── IdempotentUtils.java
│
├── gateway4j-ui/                             # 前端管理界面（Vue 3）
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/                           # 路由
│       │   └── index.ts
│       ├── stores/                           # Pinia 状态管理
│       │   ├── user.ts
│       │   ├── route.ts
│       │   └── plugin.ts
│       ├── api/                              # API 请求
│       │   ├── auth.ts
│       │   ├── route.ts
│       │   ├── plugin.ts
│       │   └── monitor.ts
│       ├── views/                            # 页面
│       │   ├── login/
│       │   │   └── index.vue
│       │   ├── route/
│       │   │   ├── list.vue                  # 路由列表
│       │   │   └── canvas.vue                # 路由编排画布
│       │   ├── plugin/
│       │   │   ├── list.vue                  # 插件列表
│       │   │   └── global.vue                # 全局插件
│       │   ├── monitor/
│       │   │   └── dashboard.vue             # 监控大盘
│       │   └── system/
│       │       ├── user.vue                  # 用户管理
│       │       └── role.vue                  # 角色管理
│       ├── components/                       # 公共组件
│       │   ├── layout/
│       │   │   ├── AppLayout.vue
│       │   │   ├── Sidebar.vue
│       │   │   └── Header.vue
│       │   ├── route/
│       │   │   ├── RouteTree.vue
│       │   │   ├── RouteFlowCanvas.vue
│       │   │   ├── ComponentPanel.vue
│       │   │   ├── NodePropertyPanel.vue
│       │   │   └── ConditionEditor.vue
│       │   ├── plugin/
│       │   │   ├── PluginCard.vue
│       │   │   ├── PluginConfigDialog.vue
│       │   │   ├── JarUploadDialog.vue
│       │   │   └── GroovyEditor.vue
│       │   └── monitor/
│       │       ├── RouteTopology.vue
│       │       ├── MetricCard.vue
│       │       └── TrendChart.vue
│       └── utils/                            # 工具
│           ├── request.ts                    # axios 封装
│           └── auth.ts                       # Token 管理
│
├── docs/                                     # 文档
│   ├── PRODUCT.md                            # PRD
│   ├── TECHNICAL_DESIGN.md                   # 技术方案
│   ├── DATABASE_DESIGN.md                    # 数据库设计
│   ├── API_CONTRACT.md                       # API 契约
│   └── PROJECT_STRUCTURE.md                  # 本文档
│
└── sql/                                      # 数据库脚本
    └── V1.0.0__init_schema.sql               # 初始化脚本
```

---

## 3. 模块依赖关系

```
gateway4j-server
  ├── gateway4j-engine
  │   ├── gateway4j-plugin-api
  │   │   └── gateway4j-common
  │   └── gateway4j-common
  ├── gateway4j-admin
  │   ├── gateway4j-engine
  │   └── gateway4j-common
  ├── gateway4j-plugin-builtins
  │   └── gateway4j-plugin-api
  └── gateway4j-common

gateway4j-ui（独立 npm 项目，通过 HTTP API 交互）
```

---

## 4. 根 POM 依赖管理

| 依赖 | 版本 | 管理模块 |
|---|---|---|
| spring-boot-dependencies | 3.4.1 | BOM |
| spring-cloud-gateway | 4.2.0 | engine |
| mybatis-plus-boot-starter | 3.5.5 | admin |
| druid-spring-boot-3-starter | 1.2.24 | admin |
| caffeine | 3.1.8 | engine |
| groovy | 4.0.15 | engine |
| java-jwt (auth0) | 4.5.0 | admin |
| micrometer-registry-prometheus | (BOM 管理) | engine |
| fastjson2 | 2.0.53 | common |
| commons-io | 2.18.0 | common |
| commons-text | 1.13.1 | common |
| lombok | (BOM 管理) | 全局 |

---

## 5. 前端技术栈

| 技术 | 版本 | 说明 |
|---|---|---|
| Vue | 3.4+ | 前端框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| Element Plus | 2.x | UI 组件库 |
| Vue Flow / AntV X6 | - | 路由编排画布 |
| Pinia | 2.x | 状态管理 |
| Vue Router | 4.x | 路由 |
| Axios | 1.x | HTTP 请求 |
| ECharts | 5.x | 监控图表 |
| Monaco Editor | - | Groovy 脚本编辑器 |

---

## 6. 构建与部署

### 6.1 后端构建

```bash
# 全量构建
mvn clean package -DskipTests

# 单模块构建
mvn clean package -pl gateway4j-server -am -DskipTests

# 运行
java -jar gateway4j-server/target/gateway4j-server.jar
```

### 6.2 前端构建

```bash
cd gateway4j-ui
npm install
npm run dev      # 开发
npm run build    # 生产构建
```

### 6.3 部署方式

- **开发环境**：后端 Spring Boot DevTools + 前端 Vite Dev Server
- **生产环境**：后端 JAR 部署 + 前端静态资源 Nginx 代理或打包进 JAR resources
