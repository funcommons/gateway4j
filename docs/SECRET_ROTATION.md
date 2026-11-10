# framework4j 凭证轮换说明（P2-9）

> 结论先行：framework4j accesstoken 为**单密钥实现（HS256 单 key），不支持双 key
> 过渡**。轮换 = 替换配置 + 重启 = **全量登出**（所有在线用户 access/refresh token 立即
> 失效，重新登录即可）。请把轮换安排在维护窗口。
>
> 版本注记（2026-11-10 订正）：gateway4j 现依赖 framework4j **v1.10.1**（根 pom
> `framework4j.version`）。本文原按 v1.2.1 陈述，经 v1.10.1 源码逐条复核，结论**不变**——
> v1.2.1 → v1.10.1 期间 accesstoken 无任何多 key / kid / 轮换宽限期能力落地
> （演进清单见 §2）。

---

## 1. 凭证清单与影响面

| 凭证 | 配置项（生产以 env 注入） | 用途 | 轮换影响 |
|---|---|---|---|
| JWT 签名密钥 | `GATEWAY4J_JWT_SECRET`（≥32 字符） | accesstoken 的 HS256 签名/验签 | 换 key 后旧 token 验签失败（10202）→ **全量登出** |
| Redis Key 加盐 | `GATEWAY4J_JWT_HASH_SALT` | `TokenUtils.calculateKeyHash(keyValue, hashSalt)` 生成 token 里的 `hash` claim，即 Redis 元数据 key | 换盐后 token 的 hash 对不上 Redis → 10201 → **全量登出** |
| 数据库口令 | `GATEWAY4J_DB_PASSWORD` | 管理库连接 | 轮换需同步改 DB 侧账号口令，重启生效 |
| 开放 API 签名密钥 | `GATEWAY4J_OPEN_API_SECRET` | `/v1/open/**` HMAC 签名三方对接 | 需与对接方协同换；未同步则签名校验失败（10302） |

> 管理面的 access-token 走 framework4j-accesstoken（JWT + Redis 双验）。签名校验先于
> Redis 查询（`TokenUtils.parseToken`），因此**换 secret-key 一定导致全量登出**，不存在
> "旧 key 只读"的过渡态。
>
> gateway4j 现配置即单 key：admin-boot `application.yml` 为
> `secret-key: ${GATEWAY4J_JWT_SECRET:…}` / `hash-salt: ${GATEWAY4J_JWT_HASH_SALT:…}`
> （env 缺省回退本地默认值，仅供本地栈兜底启动）。在该配置下轮换的实际行为 = 重启后
> `AccessTokenProperties.secretKey` 换为新值，全部存量 token 于 `parseToken` 验签处失败
> （10202），无需也无法做任何数据迁移；Redis 残留元数据等 TTL 自然过期。

## 2. 为什么做不到双 key 过渡

framework4j v1.10.1 源码事实（`framework4j-accesstoken`）：

- 验签入口 `TokenUtils.parseToken(token, secret)` 只收**一个** secret
  （util/TokenUtils.java:129）；
- `AccessTokenProperties` 只有一个 `secretKey` 字段（config/AccessTokenProperties.java:27-30，
  `@NotBlank` + `@Size(min = 32)`），无 `secretKeys` 列表、无 key id（kid）机制，无法对
  存量 token 按 key 分组验签；
- JWT header 固定 `{"alg":"HS256","typ":"JWT"}`（TokenUtils.java:43-44），payload claim
  固定为 iss/sub/type/nonce/hash/iat/exp/jti（+可选 family / 嵌套 claims，TokenUtils.java:94-108），
  **没有 key 版本位**，换 key 后无法区分"旧 key 签的"与"伪造的"；
- refresh token 与 access token 用**同一把** `secretKey` 验签
  （core/RefreshTokenService.java:187），换 key 连 refresh 一并失效——不存在
  "旧 access 失效、refresh 仍可续期"的中间态；
- 版本历史佐证（framework4j README 版本历史）：v1.2.1 → v1.10.1 期间 accesstoken 的变更
  为 v1.2.8 拦截器注册修复、v1.4.1 roles/anyRole 角色鉴权、v1.6.0 启动期 fail-fast 校验、
  v1.7.0/v1.8.0 claims 嵌入——均不涉及签名密钥体系。

> 易混淆点：`policies.<type>.key` 是 **claims 字段名**（决定 Redis 会话互斥维度），
> 不是签名密钥（v1.6.0 Issue #20 官方澄清，AccessTokenProperties.java 注释同）；
> 配置签名密钥只有 `framework4j.access-token.secret-key` 一个键。

要做"先双 key 校验、旧 key 下线"的平滑轮换，需要框架升级支持（kid / 多 key 验签），
当前版本明确做不到——**不要尝试在应用层包一层双 key 逻辑**：`parseToken` 与
`calculateKeyHash(keyValue, hashSalt)`（TokenUtils.java:209）均为单 key / 单 salt 体系
（token 里的 `hash` claim 由 hash-salt 推导、Redis 元数据 key 即按它寻址），绕过框架
拦截器自建验签会丢失 Redis 强一致校验链（key hash 寻址 → 会话元数据 → TokenContext）。

### 2.1 零登出轮换：当前版本无可配置项

v1.10.1 的 `framework4j.access-token.*` 配置面（enabled / secret-key / hash-salt /
expire-time / redis-name / path-patterns / exclude-path-patterns / policies /
embed-claims）中**不存在**多 key、kid 或轮换宽限期键——零登出轮换当前**配不出来**，
只能按 §3 做全量登出式轮换，或等框架侧提供 kid / 多 key 验签能力。

框架内确有双密钥宽限期实现，但在 **tenant 模块**（`tenant_secret_prev` 双版本列 +
`framework4j.tenant.secret.grace-hours`，默认 24h；针对租户 secret，并非 accesstoken
的 JWT 签名密钥），且 gateway4j 未依赖 framework4j-tenant（根 pom 无此模块），与
本主题无关，不可混用。

## 3. 标准轮换流程（全量登出式，5 分钟内完成）

1. **准备**：确认新 secret 满足 ≥32 字符；通知所有管理台用户即将重新登录。
2. **替换**：设置新环境变量（`GATEWAY4J_JWT_SECRET` / `GATEWAY4J_JWT_HASH_SALT`），
   不改 yml 里的默认值（默认值仅供本地栈兜底启动）。
3. **重启** admin-boot（单实例部署，重启窗口即不可用窗口）。
4. **验证**：
   - 旧 token 调任意业务接口 → 信封 10202/10201（登录已失效，符合预期）；
   - 重新登录成功、`X-Token-Expire-At` 正常。
5. **收尾**：旧 secret 从部署环境变量/密管系统删除；Redis 里残留的旧元数据 key
   （`{app}:accesstoken:*`、`refresh:family:*`）等 TTL 自然过期即可，无需手工清理。

> 只换 `hash-salt`、不换 `secret-key`（或反之）同样可行且效果等价（都是全量登出），
> 但既然都要登出一次，建议**两把一起换**。

## 4. 部分失效替代方案（不改 key 的"定点登出"）

如果目的只是让**某些用户**下线（而非全站换钥），不需要动 secret：

- 单用户踢下线：`AccessTokenGenerator.revokeByUser(tokenType, uid)`（管理面可包装成
  管理端点，按需实现）；
- 单 token 注销：`AccessTokenGenerator.revokeToken(token)`；
- 全部 refresh 家族作废：清 Redis `refresh:family:{app}:*` + `refresh:revoked:{app}:*`。

## 5. 与 gateway4j 数据面的关系

数据面（gateway4j-gateway-boot, 9300）不消费 accesstoken——它只做路由转发与插件链，
主配置（gateway4j-gateway-boot/src/main/resources/application.yml）未配置
`framework4j.access-token`（仅集成测试 profile application-it.yml 为测试注入了
access-token，与生产无关）。**本次轮换只影响管理台（gateway4j-admin-boot, 9301）
的登录态**，网关侧无需同步、不影响在途业务流量。
