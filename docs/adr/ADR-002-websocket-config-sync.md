# ADR-002：使用 WebSocket 进行配置同步推送

## 状态

已修订（2026-10-29）：主通道 Redis pub/sub `gateway4j:config:changed` + 60s DB 轮询兜底；WebSocket 方案归档；控制台实时化留待 SSE（P2-7）。

## 背景

网关集群部署时，管理后台修改配置后需将变更实时推送至所有网关实例。候选方案：

1. **WebSocket 长连接推送**：服务端主动推送，延迟低（≤ 3s），实现简单
2. **消息队列（MQ）**：通过 Kafka/RabbitMQ 广播配置变更，可靠性高，但引入新中间件
3. **纯轮询**：网关实例定时轮询数据库，实现最简，但延迟高（30s+）
4. **Redis pub/sub 广播**（修订时补充）：复用既有 Redis 依赖，广播即达全部实例，无需维护连接状态

## 决策

~~采用 WebSocket 长连接推送 + 30s 兜底轮询的混合方案。~~

**修订（2026-10-29）**：采用 **Redis pub/sub 广播（频道 `gateway4j:config:changed`）为主通道 + 60s DB 轮询比对 `config_version` 兜底**。WebSocket 网关侧接入点（`gateway4j-engine` 的 WS 会话管理/推送协议）未再开发，原方案归档。

## 理由

- **低延迟**：Redis pub/sub 广播即达（实测管理面发布 → 网关 reload 完成 **0.07s**，见下节），满足配置推送生效时间目标
- **轻量**：Redis 是既有必选依赖（配置缓存/限流/鉴权都在用），pub/sub 零新增组件；对比 WebSocket 免去连接管理、心跳、断线重连与会话亲和
- **可靠性兜底**：60s 轮询比对 `config_version` 防止广播丢失（pub/sub 非持久、订阅瞬断窗口内的消息会丢），双重保障
- **V1.0 规模适配**：网关实例数 ≤ 10 时，Redis pub/sub 足够可靠

## 实现现状（2026-10-29）

- **主通道**：管理面 `ConfigChangeNotifier` 监听 `ConfigChangeEvent`（事务提交后）向频道 `gateway4j:config:changed` 发布 `{"version":N,"operator":"...","changedType":"route|plugin|global-plugin","at":<epoch ms>}`；网关侧 `ConfigPushHandler` 订阅同频道触发 `RefreshRoutesEvent` 式 reload。
- **兜底**：网关实例每 60s 比对 DB 全局 `config_version` 与本地版本，落后即 reload。
- **生效水位**：engine 每次 reload 完成后写 Redis `gateway4j:config:sync` = `{"version":N,"fingerprint":"...","updated_at":<ms>,"instance":"..."}`（TTL 120s）；管理面 `GET /v1/config/sync-status` 读该水位与 DB 版本比对，供「发布生效确认」（P1-3）。
- **实测**：管理面发布 → 网关配置生效端到端 **0.07s**（本地回归环境，Redis pub/sub 主通道命中，未触发轮询兜底）。

## 后果

- **正面**：零新增中间件；广播即达、延迟实测亚秒级；管理面/网关均无连接状态机要维护
- **负面**：Redis pub/sub 非持久化（订阅瞬断丢消息）——由 60s DB 轮询兜底补偿；Redis 本身成为同步链路单点（与配置缓存/限流同域，可接受）
- **风险**：集群规模 > 50 实例时 pub/sub 广播扇出与每实例 reload 风暴可能成为瓶颈，届时需迁移至 MQ 方案
- **缓解**：60s 轮询兜底 + `gateway4j:config:sync` 水位可观测（sync-status 接口）+ 大盘告警，确保最终一致性
- **归档说明**：控制台侧「配置变更实时可见」（原 WebSocket 的另一设想用途）由 P2-7（SSE）承接，不回退本 ADR
