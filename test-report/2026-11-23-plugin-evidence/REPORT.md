# 钉钉登录 + 安全水印插件 截图证据测试报告

- **日期**：2026-11-23
- **需求来源**：用户指令「我要 钉钉 水印 插件的测试报告， 要截图证据」
- **测试对象**：gateway4j 两个内置安全插件（mc-ecurity-wall 移植批 S11 成果）
  - DingTalkPlugin（PRE，order=2）：钉钉 OAuth2 扫码登录、state CSRF、JWT 会话、logout、X-User 头注入
  - WatermarkPlugin（PRE，order=900）：HTML 响应注入 canvas 平铺水印脚本（防删/iframe 协同/用户化脱敏）
- **测试方式**：Mock 钉钉 OAuth2 服务（9390）+ Mock 上游（8091，回显 X-User）+ Playwright 实播截图取证
- **结论**：**七证据全绿**。过程中实锤并修复**两层引擎级架构断裂**（本报告第 4 节，是本次测试最大的产出）

---

## 1. 测试环境

| 组件 | 端口 | 说明 |
|---|---|---|
| gateway-boot | 9300 | S11-4e 版 fat jar（含晚绑定桥） |
| admin-boot | 9301 | V1.6.1 已执行（watermark phase=PRE） |
| Mock 钉钉 | 9390 | `POST /v1.0/oauth2/userAccessToken` + `GET /v1.0/contact/users/me`（校验钉钉新版认证头 `x-acs-dingtalk-access-token`） |
| Mock 上游 | 8091 | 返回 HTML，回显 `X-User` 头到 `<div id='xuser'>` |
| Playwright | chromium 1280×900 | 探针脚本见 `screenshots/main.mjs`（七证据）+ `screenshots/ev1only.mjs`（HTTP 级取证） |

**测试数据**（测后已清理，恢复 7 路由基线）：

```sql
-- 路由 -30 mock_dingtalk_test：BACKEND，/mock/** → http://127.0.0.1:8091（PUBLISHED）
-- 绑定：dingtalk（sort 1）+ watermark（sort 2）
-- dingtalk config：appKey=test-app-key / corpId=ding-mock-corp / apiBaseUrl=http://127.0.0.1:9390
--   loginServer=http://localhost:9300 / basePath=/mock / excludePaths=["/actuator"]
-- watermark config：org=名传 / sessionCookieName=fu-gw-token / stripCsp=false
```

---

## 2. 七证据清单（截图见 screenshots/）

| # | 证据 | 断言 | 结果 | 截图 |
|---|---|---|---|---|
| ev1 | 未登录 302 跳钉钉 | `GET /mock/hello` 无 cookie → 302 → `login.dingtalk.com/oauth2/auth?...state=...` | ✅ | `ev1-mock-intercept.png`（HTTP 级抓包+state 四段解构）/ `ev1-login-redirect.png`（浏览器真实跳转落到钉钉域名） |
| ev2 | 登录态 + 水印渲染 | 回调 `?authCode&state` → 出站换 token → users/me → JWT cookie（httpOnly）→ 302 回原 URL → 上游页面 **canvas 水印满屏** + `X-User: mock-union-001` 回显 | ✅ | `ev2-logged-in-watermark.png` |
| ev3 | 会话 cookie 安全性 | `fu-gw-token` httpOnly=true；`document.cookie` 读不到 → 水印回落静态文案（已知限制，见 §5） | ✅ | run.json `ev3` 字段 |
| ev4 | 水印防删 | JS 删除 `#gw-watermark` → MutationObserver 即刻重建（`restored: true`） | ✅ | `ev4-watermark-antiremove.png`（红框为探针删除尝试标记，水印满屏依旧） |
| ev5 | state 防篡改 | 篡改 state 第四段（HMAC 签名）→ `401 {"code":401,"message":"state validation failed"}` | ✅ | `ev5-tampered-401.png` |
| ev6 | logout | `GET /mock/logout` → 200 logged out + cookie 清空（cookies after = 0）→ 再访问 302 重登 | ✅ | `ev6-after-logout.png`（logout 后浏览器被 302 到钉钉登录域——重新进入未登录拦截流的真实落页） |
| ev7 | JWT 会话内容 | cookie payload：`unionId=mock-union-001 / nick=张三 / corpId=ding-mock-corp / mobile=13800138000 / iss=dingtalk`，自签 HS256 | ✅ | run.json `ev2Cookies` 原文 |

**DOM 级断言原文**（run.json ev2Body）：`watermarkDivs=1 / watermarkScripts=1 / watermarkHasObserver=true / watermarkHasCrc=true`，水印背景为 canvas toDataURL 图案（`wmTextSample: url("data:image/png;base64,...")`）。

---

## 3. Mock 协议三坑（均为我方 Mock 初版写错，非插件错）

1. token 交换请求体键 = `code`（非 authCode）——对齐钉钉真实协议；
2. `users/me` 认证头 = **`x-acs-dingtalk-access-token`**（钉钉新版 API 头，非 `Authorization: Bearer`）；
3. `users/me` 响应体须含 `corpId` 字段——插件的 corpId 校验数据源在 users/me（不在 token 响应）。

---

## 4. 架构发现与修复全程（本次测试最大产出）

水印插件「execute 被调但响应零注入」连续挖出**三层架构问题**，前两层为引擎级断裂：

### 4.1 第一层：POST 阶段响应改写天然失效（S11-4c 修复，commit a64cc9a）

`PluginExecutionFilter` 的 POST 链挂在 `chain.filter(exchange).then(POST 链)`——POST 插件在**转发完成后**才执行，此时上游响应已由 SCG 用原始 response 写回客户端，POST 阶段的 `response decorator` mutate 太晚，天然失效。
**修复**：WatermarkPlugin phase POST→PRE + order=900（PRE 末尾：dingtalk=2 等短路类先跑，未登录已被 302，轮不到水印）+ Flyway V1.6.1 fix-forward。

### 4.2 第二层：插件链 runner 边界吃掉 mutated exchange（S11-4d 修复，commit 717dd64）

phase 修正后仍零注入。埋点+代码走读实锤：`FailSafePluginChainRunner` **内部**传播正常（`chain.execute(mutated)` → `executeFrom(mutated)`），但**边界断裂**——PRE runner 的终点 continuation 是无参 `Mono.empty()`，外层 `chain.filter(exchange)` 用方法入参原始引用转发。
**修复**：runner API 演进 `executeFn(exchange, Function<ServerWebExchange, Mono<Void>>)`——终点 `continuation.apply(exchange)` 交出链内最终 exchange；旧 `execute(exchange, Mono)` 保留 delegate 兼容（POST observe-only）。T RED 两红实锤断裂（转发收到 `MockServerHttpResponse` 而非 decorator），修复后 engine 241 全绿。

### 4.3 第三层：SCG 写回闭包提前绑定（S11-4e 修复，commit 9683a1e）——字节码级根因

S11-4d 后**仍**零注入。埋点实锤：execute 被调、decorator 已包上 exchange，但 **decorator.writeWith 全程零调用**。javap 反编译 `spring-cloud-gateway-server-4.3.1` 的 `NettyWriteResponseFilter`：

```
filter(exchange, chain) → chain.filter(exchange)        ← 下行传"它被调时的 exchange"
    .then(Mono.defer(supplier 捕获 this + exchange))   ← 写回闭包持有 order=-1 被调时的原始引用
```

`NettyWriteResponseFilter`（order=**-1**，下行最早段被调）的写回闭包在**插件链（order=10020，依赖分发路由 10010 必须晚跑）运行前**就已装配绑定原始 response——插件 `mutate().response(decorator)` 只向下游传播（NettyRoutingFilter 收到 mutated 做上游调用没问题），写回路径用的仍是原始 response。**装饰结构上不可达**。这正是「SCG 响应装饰模式必须挂 order<-1」与「插件链必须晚跑」的时序矛盾，S11-4d 只解决了「转发收到 mutated」，未解决「写回闭包看不到装饰」。

**修复（晚绑定装饰桥，解耦时序矛盾）**：

- 新增 `PluginResponseDecorationBridgeFilter`（order=**-2**，先于写过滤器被调）：无条件把 response 换成透明 `LateBindingResponseDecorator`——它成为写回闭包捕获的对象；
- `LateBindingResponseDecorator` 在 **writeWith/writeAndFlushWith 写回时**才从 exchange attributes 解析装饰工厂（`GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY`，`Function<ServerHttpResponse, ServerHttpResponse>`；attribute map 原始/mutated exchange 共享）——插件链运行时置入的工厂延迟到写回时刻应用；无工厂逐字节透传；
- 含装配期再入护栏（工厂产物 delegate 回指桥的同步递归防 StackOverflow——新测试第 1 轮抓到的真缺陷）；
- **响应装饰类插件新用法入册**：execute 置 attribute 工厂后透传，**勿再 `mutate().response()`**（WatermarkPlugin javadoc 三层架构叙事归档）。

**修复后即时验证**：响应体 135 字节 → 5078 字节，脚本恰在 `</body>` 前注入，canvas/CRC16/MutationObserver 能力函数全在位。

### 4.4 三组 mvn 终态（S11-4d + S11-4e 合计）

| 模块 | 终态 |
|---|---|
| gateway4j-engine | 247 全绿（S11-4d +7 / S11-4e 桥 +6，基线 234） |
| gateway4j-plugin-builtins | 267 全绿（水印语义迁移 13 用例 + attribute 契约 2 新增，基线 265） |
| gateway4j-gateway-boot | 25 全绿（含 Testcontainers 冒烟 4/4） |

### 4.5 波及面提示（遗留候选池）

`ModifyResponse` / `CryptorResponse` 两个内置插件与水印同为响应改写类，大概率同样失效（其单测用 MockServerWebExchange 不暴露该错配——**mapper-mock 假绿家族新成员**）。迁移到晚绑定桥 attribute 工厂模式为独立票待排。

---

## 5. 已知限制与处置候选

**HttpOnly 会话 cookie vs 水印用户化冲突**（ev3 实锤）：
- S11-1 安全口径下 `fu-gw-token` 为 HttpOnly，水印脚本 `document.cookie` 读不到 JWT → nick/mobile 脱敏用户化文案不生效，**回落静态文案**（当前截图即静态「名传内部系统 / 未经授权 禁止外传」）；
- 防伪权衡：改成非 HttpOnly 会把会话 JWT 暴露给 XSS；
- **处置候选**：钉钉插件回调时额外下发非 HttpOnly 的**展示专用** cookie（如 `fu-gw-nick`，只含脱敏展示字段、无会话效力），水印脚本改读它——待用户裁决后排票。

**Playwright 跨域导航拦截 flake**：`page.route('**login.dingtalk.com**')` 拦截 302 导航两轮未命中（同脚本早轮命中过），改用 API 请求层直取 302 Location（`ev1only.mjs`）确定性取证——HTTP 级证据反而更强。

---

## 6. 复现指引

```bash
# 1. 起 Mock 双服务
python3 gateway4j-admin-ui/e2e-regression/mock-dingtalk/mock_dingtalk.py ding &   # 9390
python3 gateway4j-admin-ui/e2e-regression/mock-dingtalk/mock_dingtalk.py upstream &  # 8091
# 2. 建 /mock/** 路由（上游 8091）+ 绑定 dingtalk/watermark，插件 config 见 §1
# 3. 双插件 ENABLED（enable 独立端点 POST /v1/plugins/{id}/enable）
# 4. 跑探针
node test-report/2026-11-23-plugin-evidence/screenshots/main.mjs
```

**测后清理已执行**：路由 -30 + 绑定 2 行已删，双插件恢复种子态（DISABLED，config={}），路由基线 7 实核。
