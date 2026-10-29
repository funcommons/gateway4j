# framework4j 凭证轮换说明（P2-9）

> 结论先行：framework4j v1.2.1 accesstoken 为**单密钥实现（HS256 单 key），不支持双 key
> 过渡**。轮换 = 替换配置 + 重启 = **全量登出**（所有在线用户 access/refresh token 立即
> 失效，重新登录即可）。请把轮换安排在维护窗口。

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

## 2. 为什么做不到双 key 过渡

framework4j v1.2.1 源码事实（`framework4j-accesstoken` v1.2.1）：

- 验签入口 `TokenUtils.parseToken(token, secret)` 只收**一个** secret；
- `AccessTokenProperties` 只有一个 `secretKey` 字段，无 `secretKeys` 列表、无 key id
  （kid）机制，无法对存量 token 按 key 分组验签；
- token payload 里也没有 key 版本位，换 key 后无法区分"旧 key 签的"与"伪造的"。

要做"先双 key 校验、旧 key 下线"的平滑轮换，需要框架升级支持（kid / 多 key 验签），
当前版本明确做不到——**不要尝试在应用层包一层双 key 逻辑**，会破坏 Redis 强一致校验
（nonce/hash 均按单 key 体系推导）。

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
未配置 `framework4j.access-token`。**本次轮换只影响管理台（gateway4j-admin-boot, 9301）
的登录态**，网关侧无需同步、不影响在途业务流量。
