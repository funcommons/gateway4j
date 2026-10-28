# AutoFill(代填账密)内置插件改造方案

> 状态:草稿 V1.0
> 关联:`gateway4j-plugin-builtins`(新增插件)、`gateway4j-gateway-boot/src/main/resources/static/fu-autofill.js`(前端脚本)、`gateway4j-admin`(配置 Schema)

---

## 1. 背景与现状

`fu-autofill.js`(271 行)已在 `gateway4j-gateway-boot/src/main/resources/static/` 中,前端能力完整:

| 已有能力 | 说明 |
|---|---|
| 隐藏凭据池 | 从 `<div id="__autofill_secret">` 读取 Base64(JSON) 配置,用后即删 |
| 双选择器 | `css:input[name=user]` / `xpath://input[@name='user']` |
| SPA 兼容 | React 原生 setter hack + 立即/轮询/MutationObserver 三段式调度 |
| 路由适配 | `window.location.pathname !== config.url` 时等待 |
| 防清空 | 填充后 3s 守卫,防 SPA re-render 冲掉值 |
| 自清理 | 15s 超时,删除凭据节点、断开 observer |

**问题:它是孤儿文件。** 全工程无任何 Java/yml 引用,没有插件封装、没有后台配置入口、没有凭据存储,跑不起来。

参照对象:`watermark` 内置插件已完整闭环(Plugin + Config + 常量 + Admin Schema + 响应装饰器注入),本方案完全复用该模式。

## 2. 目标与非目标

**目标(V1)**

1. 新增 `autofill` 内置插件(POST 阶段),与 watermark 同构
2. 管理后台可视化配置凭据条目(URL → 账号/密码/选择器),凭据在库内 AES-256-GCM 加密
3. 命中目标登录页的 HTML 响应时,在 `</body>` 前注入凭据 div + 脚本引用,浏览器自动填充
4. 仅对**已通过网关认证**的用户注入(与 dingtalk / jwt 插件协同)

**非目标(V1 不做)**

- 不托管员工个人密码(个人密码交给浏览器密码管理器)
- 不做自动点击登录按钮(作为可选项在 V1.1 讨论)
- 不做凭据浏览器端持久化(填完即焚,由 fu-autofill.js 自清理保证)

## 3. 威胁模型与安全边界(必须先对齐)

**本质限制:浏览器能解密的东西,用户就能看到。** 打开 DevTools 的任何人都能从注入的 div 里还原出明文账密。任何"前端加密"方案都改变不了这一点——钥匙也在同一个页面里。

因此本插件的定位必须明确:

> **代填的是"共享系统账号"(如第三方供应商后台、老旧内部系统),不是员工个人密码。**
> 价值链 = 用户先过网关认证(钉钉 SSO)→ 网关知道"谁"在用 → 网关替用户填充共享账号 → 密码本身不进入员工大脑/聊天记录/便签。

分层缓解(纵深防御,与 watermark 体系互补):

| 层 | 措施 |
|---|---|
| 传输 | 仅 HTTPS 部署(loginServer 强制 https) |
| 存储 | 凭据字段经 framework4j-sensitive `EncryptedFieldTypeHandler` AES-256-GCM 落库 |
| 注入门控 | 请求必须携带有效网关 token(挂在该路由的 dingtalk/jwt PRE 插件之后才生效) |
| 精确命中 | 仅当 请求路径 == 配置的登录页 URL 且 Content-Type 为 text/html 时注入,其余响应一概不动 |
| 溯源 | watermark 插件同页注入姓名/手机号水印,截屏外泄可追人 |
| 审计 | 注入行为 `@Auditable` 记录(谁、哪个 URL、何时) |
| 可轮换 | 共享密码改库即生效(配置推送 ≤3s),泄露后秒级换密 |

**残余风险(接受)**:已认证员工用 DevTools 提取共享密码。缓解靠水印溯源 + 审计 + 定期轮换;这是产品定位内的已知代价,不是 bug。

## 4. 总体流程

```
用户浏览器                网关(gateway-boot)                      上游系统
    │ GET /vendor/login        │                                    │
    │ (带 fu-gw-token)         │                                    │
    │──────────────────────►  │ ①全局PRE: dingtalk/jwt 认证 ✓       │
    │                          │ ②路由转发                          │
    │                          │───────────────────────────────────►│
    │                          │ ◄──────────── HTML 登录页 ─────────│
    │ ◄── 改写后的 HTML ──────│ ③autofill POST 插件:               │
    │   </body> 前插入:        │   - 路径匹配凭据条目?               │
    │   <div id=__autofill_secret>BASE64</div>                     │
    │   <script src=/fu-autofill.js></script>                      │
    │                          │   - 移除 CSP 头                     │
    │ ④脚本解析→填充→自清理     │
```

## 5. 详细设计

### 5.1 常量注册

`BuiltinPluginConstants` 增加:

```java
// Response injection
public static final String WATERMARK = "watermark";
public static final String AUTOFILL = "autofill";   // 新增
```

### 5.2 配置模型 — `AutoFillPluginConfig`

新包 `fun.commons.gateway4j.plugin.builtins.autofill`:

```java
public class AutoFillEntry {
    private String url;                // 目标登录页路径,精确前缀匹配,如 /vendor/login
    private String username;           // 共享账号(库内加密)
    private String password;           // 共享密码(库内加密)
    private String usernameSelector;   // css:#username 或 xpath://input[@name='user']
    private String passwordSelector;   // css:input[type=password]
}

public class AutoFillPluginConfig {
    private boolean enabled = true;
    private String scriptUrl = "/fu-autofill.js";  // 默认网关自带脚本
    private long maxBodyLength = 1024 * 1024;      // 超过 1MB 的 HTML 不注入
    private List<AutoFillEntry> entries = List.of();
    // getter/setter 同 WatermarkPluginConfig 风格
}
```

字段与 `fu-autofill.js` 现有读取的 JSON key 一一对应(`url/username/password/usernameSelector/passwordSelector`),前端脚本**零改动即可消费**。

### 5.3 插件实现 — `AutoFillPlugin`

```java
public class AutoFillPlugin extends AbstractGatewayPlugin {
    public AutoFillPlugin() {
        super(BuiltinPluginConstants.AUTOFILL, "代填账密插件", "POST", 9);
        // order=9,排在 watermark(order=8)之后,保证同页水印先就位
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || !config.isEnabled() || config.getEntries().isEmpty()) {
            return chain.execute(exchange);
        }
        // 认证门控:exchange attributes 中无认证身份则不注入
        // (dingtalk/jwt PRE 插件写入的身份标记,具体 key 实现时对齐)
        ServerWebExchange mutated = exchange.mutate()
                .response(new AutoFillDecorator(exchange)).build();
        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), AutoFillPluginConfig.class);
    }
}
```

`AutoFillDecorator`(照抄 `WatermarkDecorator` 骨架):

1. `writeWith` 拦截,Content-Type 非 `text/html` 兼容 → 直接放行
2. `Content-Length > maxBodyLength` → 放行
3. **条目匹配**:请求路径 `exchange.getRequest().getPath().value()` 对 `entries[].url` 做精确/前缀匹配,无命中 → 放行(**未命中的页面绝不注入**,这是与 watermark 最大的逻辑差异)
4. 移除 `content-security-policy` 头
5. HTML 聚合 → 找 `</body>` 前插入:

```html
<div id="__autofill_secret" style="display:none">BASE64(JSON.stringify(entry))</div>
<script src="/fu-autofill.js"></script>
```

6. 重设 Content-Length

安全细节:

- `BASE64` 用 `java.util.Base64.getEncoder().encodeToString(json.getBytes(UTF_8))`,与脚本里 `b64DecodeUnicode` 对齐
- div 加 `style="display:none"`(脚本用的是 innerText,display:none 不影响读取,但比裸 div 少一次闪烁)
- **只注入命中的那一条 entry**,不把整个 entries 列表发给浏览器

### 5.4 凭据存储加密

- `Plugin.config`(JSONB)中 `entries[].username/password` 落库前经 framework4j-sensitive `EncryptedFieldTypeHandler` AES-256-GCM 加密(CLAUDE.md NFR 已有约定)
- 管理后台保存时加密、网关实例加载配置后解密再注入
- Admin UI 展示时密码列一律掩码(`******`),编辑留空 = 不修改

### 5.5 Admin 后台 Schema 注册

`BuiltinPluginTypeRegistry` 构造器追加(与 watermark 条目并列):

```java
register(new BuiltinType("autofill", "代填账密插件", "POST",
        "登录页 HTML 自动填充共享账号密码(仅认证用户,凭据加密存储)",
        obj(
            str("scriptUrl", "填充脚本 URL"),
            num("maxBodyLength", "最大注入 HTML 大小"),
            // entries 为对象数组,复用现有 schema builder 需扩展一个 objs() 辅助方法
            objs("entries", "凭据条目",
                str("url", "登录页路径"),
                str("username", "共享账号"),
                str("password", "共享密码"),
                str("usernameSelector", "账号选择器(css:/xpath:)"),
                str("passwordSelector", "密码选择器(css:/xpath:)")))));
```

> 现有 schema builder 只有 `arr()`(字符串数组),需新增一个对象数组辅助方法 `objs()`,约 10 行。

### 5.6 插件实例注册

现状:`WatermarkPlugin` 等内置类**无 Spring 注解**,主工程暂无实例化点(仅测试里 new)。本方案顺带补齐统一注册(与 watermark 共用,不是 autofill 专属逻辑):

在 `gateway4j-gateway-boot`(或 plugin-builtins 提供 `@Configuration`)声明:

```java
@Bean public WatermarkPlugin watermarkPlugin() { return new WatermarkPlugin(); }
@Bean public AutoFillPlugin autofillPlugin() { return new AutoFillPlugin(); }
```

由 `GatewayWebHandler.setGlobalPostPlugins(...)` / 路由-插件绑定机制消费;`ConfigService` 加载 `plugin` 表记录后按 `plugin_id` 调 `onConfigChange` 注入配置。*实现时先核对主链路(plugin 表 → 实例 → onConfigChange)当前接线状态,若 watermark 同样未接线,则两插件一起在 V1 接通。*

### 5.7 `fu-autofill.js` 改动(极小)

V1 前端脚本**无需功能改动**,仅两处加固:

| # | 改动 | 原因 |
|---|---|---|
| 1 | `cleanUp()` 已删除凭据 div ✓;补一个 `window.addEventListener('beforeunload')` 兜底清理 | 内存中 config 引用随页面销毁,主要是防长驻 SPA 页签残留 |
| 2 | `console.log` 的填充日志改为可关(`window.__AUTOFILL_DEBUG__` 开关) | 生产控制台不出现 "Password filled." 字样 |

### 5.8 认证门控的实现要点

`AutoFillPlugin` 在 `execute()` 里检查认证上下文:

- 若路由同时绑定了 `dingtalk` 或 `jwt` PRE 插件,未认证请求根本到不了 POST 阶段(前置已被拦截/302),天然安全
- 防御性兜底:POST 阶段再检查一次 exchange attributes / `fu-gw-token` cookie,无身份 → 不注入(防止用户只给路由绑了 autofill 没绑认证插件的误配置)

## 6. 代码改动清单

| 模块 | 文件 | 动作 |
|---|---|---|
| plugin-builtins | `BuiltinPluginConstants.java` | +1 行常量 `AUTOFILL` |
| plugin-builtins | `builtins/autofill/AutoFillEntry.java` | 新建 |
| plugin-builtins | `builtins/autofill/AutoFillPluginConfig.java` | 新建 |
| plugin-builtins | `builtins/autofill/AutoFillPlugin.java` | 新建(~130 行,含 Decorator) |
| plugin-builtins | `src/test/.../autofill/AutoFillPluginTest.java` | 新建(对齐 WatermarkPluginTest) |
| admin | `BuiltinPluginTypeRegistry.java` | +schema 条目 +`objs()` 辅助方法 |
| gateway-boot | `static/fu-autofill.js` | 2 处小加固(5.7) |
| gateway-boot | 插件 Bean 注册处 | +`AutoFillPlugin` Bean(与 watermark 一起) |
| sql | 插件种子数据(可选) | `plugin` 表预置 autofill 记录,status=DISABLED |

预计后端新增/修改 ≈ 400 行,前端 < 20 行。

## 7. 测试计划

**单元测试**(对齐 `WatermarkPluginTest` 风格):

1. 非 HTML 响应不注入
2. 超过 maxBodyLength 不注入
3. 请求路径无条目命中不注入(**核心新逻辑**)
4. 命中条目:`</body>` 前插入 div + script,CSP 头被移除,Content-Length 更新
5. 多条目只注入命中的那一条(凭据不串页)
6. `enabled=false` / config 为 null 直接放行
7. Base64 编码含中文账号时,与前端 `b64DecodeUnicode` 往返一致(用 JS 侧同款算法在 Java 测试里断言)

**e2e / 手工验证**:

- 准备一个演示登录页(可用 TestController 或 mock 上游)
- admin 后台:创建 autofill 插件 → 配置条目 → 绑定演示路由 → 启用
- 浏览器访问:未登录 → 被 dingtalk 拦截;登录后 → 打开页面自动填好账号密码,F12 确认凭据 div 已被脚本删除
- 配置改密 → 30s 内(推送/轮询)再次访问,填的是新密码

## 8. 上线与回滚

| 项 | 方案 |
|---|---|
| 发布 | 内置插件随网关版本发布;启用靠后台开关,`enabled=false` 即完全旁路 |
| 灰度 | 先在单条演示路由启用验证,再挂生产路由 |
| 回滚 | 后台一键禁用(≤3s 生效);极端情况移除路由绑定 |
| 审计 | 上线后开 `@Auditable` 注入日志,每周 review 注入次数与来源用户 |

## 9. V2 演进方向(本期不做)

1. **自动提交**:`AutoFillEntry` 加 `autoSubmit: true` + 提交按钮选择器,填完自动点登录(对"纯代登"场景)
2. **按人发密**:凭据表加 `user_id` 维度,不同员工注入不同子账号(需 admin CRUD 页面)
3. **Vault 对接**:凭据不落库,运行时从 Vault/KMS 取,泄露面进一步收窄
4. **WebCrypto 传输加密**:响应带临时 AES key(仍非绝对安全,但提高提取门槛)+ 短 TTL

## 10. 待确认问题

1. **自动提交**是否 V1 就要?(影响 entry 结构和脚本改动量,建议 V1.1)
2. 凭据加密密钥由 framework4j-sensitive 统一管理,是否有独立的密钥轮换要求?
3. 目标登录页是否有跨域 iframe 结构?(iframe 内填充需要脚本支持 top/parent,当前 fu-autofill.js 只在当前文档找元素,若有 iframe 场景需 V1 解决)
4. 插件 Bean 注册点(5.6)与主链路接线状态,实现前需与 watermark 现状对齐——若主链路未接通,是否本期一并补齐?
