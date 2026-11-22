package fun.commons.gateway4j.admin.service;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Static catalog of builtin plugin types: id, name, phase, description and a
 * JSON Schema for the plugin's config, used by the admin console to render a
 * dynamic configuration form. Kept as data (not the plugin classes) so the
 * admin module stays decoupled from gateway4j-plugin-builtins.
 */
@Component
public class BuiltinPluginTypeRegistry {

    public record BuiltinType(String pluginId, String pluginName, String pluginPhase,
                              String description, String configSchema) {}

    private final Map<String, BuiltinType> types = new LinkedHashMap<>();

    public BuiltinPluginTypeRegistry() {
        register(new BuiltinType("security", "安全插件", "PRE", "IP 黑白名单 + Header 验证",
                obj(props(
                        arr("ipWhitelist", "IP 白名单"),
                        arr("ipBlacklist", "IP 黑名单"),
                        str("requiredHeaders", "必需 Header")))));
        register(new BuiltinType("basic-auth", "Basic认证插件", "PRE", "HTTP Basic 认证",
                obj(props(mapOfStr("accounts", "账号映射(username→password)")))));
        register(new BuiltinType("key-auth", "Key认证插件", "PRE", "API Key 认证",
                obj(str("keyName", "Key 名称"), str("key", "Key 值"))));
        register(new BuiltinType("jwt", "JWT插件", "PRE", "JWT Token 验证（HS/RS/ES 系列）",
                obj(str("secretKey", "密钥"), str("publicKey", "公钥"), str("algorithm", "算法"),
                        str("tokenHeader", "Token Header"))));
        register(new BuiltinType("oauth2", "OAuth2插件", "PRE", "OAuth2 令牌校验 + 用户信息注入",
                obj(str("clientId", "客户端 ID"), str("clientSecret", "客户端密钥"),
                        str("tokenUri", "令牌地址"), str("userInfoUri", "用户信息地址"))));
        register(new BuiltinType("sign", "签名验证插件", "PRE", "HMAC 请求签名校验",
                obj(str("appKey", "AppKey"), str("appSecret", "AppSecret"),
                        num("delayMinutes", "允许延迟分钟"), str("algorithm", "算法"))));
        register(new BuiltinType("rate-limiter", "限流插件", "PRE", "令牌桶限流（本地/Redis 分布式）",
                obj(num("limit", "限流阈值"), num("window", "时间窗口(秒)"),
                        en("dimension", "限流维度", "IP", "ROUTE", "GLOBAL"),
                        en("mode", "限流模式", "LOCAL", "DISTRIBUTED"))));
        register(new BuiltinType("circuit-breaker", "熔断插件", "PRE", "Resilience4j 熔断 + 限流 + 降级",
                obj(num("failureRateThreshold", "失败率阈值"), num("waitDurationInOpenStateMs", "开启等待(毫秒)"),
                        num("slidingWindowSize", "滑动窗口大小"), str("fallbackUri", "降级地址"))));
        register(new BuiltinType("sentinel", "Sentinel插件", "PRE", "Alibaba Sentinel 流控 + 熔断",
                obj(en("resourceMode", "资源模式", "ROUTE", "IP"))));
        register(new BuiltinType("rewrite", "重写插件", "PRE", "正则路径重写 + 灰度百分比",
                obj(str("regex", "匹配正则"), str("replace", "替换串"), num("percentage", "灰度百分比"))));
        register(new BuiltinType("redirect", "重定向插件", "PRE", "内部转发 / 外部重定向",
                obj(str("redirectURI", "重定向地址"), num("httpStatusCode", "HTTP 状态码"))));
        register(new BuiltinType("param-mapping", "参数映射插件", "PRE", "请求参数增删改",
                obj(props(arr("removeParameterKeys", "删除参数"),
                        arr("replaceParameterKeys", "替换参数"),
                        arr("addParameterKeys", "新增参数")))));
        register(new BuiltinType("context-path", "上下文路径插件", "PRE", "路径前缀剥离/添加/改写",
                obj(str("addPrefix", "添加前缀"), num("stripPrefix", "剥离前缀数"), str("rewriteContextPath", "改写路径"))));
        register(new BuiltinType("request", "请求改写插件", "PRE", "Header/Query/Cookie 增删改",
                obj(props(mapOfStr("addHeaders", "添加 Header"), arr("removeHeaders", "删除 Header"),
                        mapOfStr("addQueryParams", "添加 Query"), arr("removeQueryParams", "删除 Query")))));
        register(new BuiltinType("logging", "日志插件", "PRE", "结构化请求/响应日志 + 脱敏",
                obj(bool("logRequestBody", "记录请求体"), bool("logResponseBody", "记录响应体"),
                        num("maxBodySize", "最大 Body 长度"))));
        register(new BuiltinType("logging-kafka", "日志-Kafka插件", "POST", "访问日志推送到 Kafka",
                obj(str("bootstrapServer", "Kafka 地址"), str("topic", "主题"), str("compressAlg", "压缩算法"))));
        register(new BuiltinType("logging-es", "日志-ES插件", "POST", "访问日志批量写入 Elasticsearch",
                obj(str("host", "ES 主机"), num("port", "端口"), str("indexName", "索引名"),
                        str("username", "用户名"), str("password", "密码"))));
        register(new BuiltinType("tracing", "链路追踪插件", "PRE", "W3C Trace Context trace-id 注入",
                obj(bool("enabled", "启用"))));
        register(new BuiltinType("metrics", "指标采集插件", "PRE", "Micrometer 请求计数/延迟/错误指标",
                obj(bool("enabled", "启用"), str("metricsPrefix", "指标前缀"))));
        register(new BuiltinType("cache", "缓存插件", "PRE", "响应缓存（本地/Redis 分布式）",
                obj(num("ttlSeconds", "缓存 TTL(秒)"), num("maxBodySize", "最大缓存体"),
                        en("mode", "缓存模式", "LOCAL", "DISTRIBUTED"), str("cacheKeyTemplate", "Key 模板"))));
        register(new BuiltinType("retry", "重试插件", "PRE", "固定/退避/故障转移重试",
                obj(num("retryCount", "重试次数"),
                        en("strategy", "重试策略", "FIXED", "EXPONENTIAL", "FAILOVER"),
                        num("waitDurationMs", "等待(毫秒)"), str("failoverUpstream", "故障转移地址"))));
        register(new BuiltinType("websocket", "WebSocket插件", "PRE", "WebSocket 代理",
                obj(str("upstreamUrl", "上游地址"), num("maxFrameSize", "最大帧大小"), bool("proxyHeaders", "转发 Header"))));
        register(new BuiltinType("waf", "WAF插件", "PRE", "Web 应用防火墙",
                obj(en("model", "模式", "black", "mixed"), en("permission", "权限", "reject", "allow"),
                        num("statusCode", "拒绝状态码"))));
        register(new BuiltinType("modify-response", "响应改写插件", "POST", "响应 Header/状态码/Body 修改",
                obj(props(mapOfStr("addHeaders", "添加 Header"), arr("removeHeaders", "删除 Header"),
                        num("statusCode", "状态码")))));
        register(new BuiltinType("cryptor-request", "请求加密插件", "PRE", "请求体 JSON 字段 AES 解密",
                obj(str("algorithm", "算法"), str("secretKey", "密钥"), arr("decryptFieldPaths", "解密字段路径"))));
        register(new BuiltinType("cryptor-response", "响应加密插件", "POST", "响应体 JSON 字段 AES 加密",
                obj(str("algorithm", "算法"), str("secretKey", "密钥"), arr("encryptFieldPaths", "加密字段路径"))));
        register(new BuiltinType("sharing", "共享插件", "PRE", "跨插件数据共享",
                obj(bool("enabled", "启用"))));
        register(new BuiltinType("mock", "Mock插件", "PRE", "模拟响应（短路返回）",
                obj(num("statusCode", "状态码"), str("responseContent", "响应内容"), str("contentType", "内容类型"))));
        register(new BuiltinType("dingtalk", "钉钉认证插件", "PRE", "钉钉 SSO OAuth2 登录，用户信息注入 X-User 头",
                obj(str("corpId", "企业 CorpId"), str("appKey", "应用 AppKey"), str("appSecret", "应用 AppSecret"),
                        str("loginServer", "登录主页"), str("cookieName", "Token Cookie 名"),
                        arr("excludePaths", "排除路径"), arr("excludeFileExt", "排除文件扩展名"),
                        pwdEnc("stateSecret", "State CSRF 密钥", "缺省从 appSecret 派生（SHA-256）"),
                        numDef("stateTimeout", "State 时效(秒)", 300),
                        pwdEnc("jwtSecret", "会话 JWT 密钥", "缺省回落 appSecret"),
                        numDef("tokenTimeout", "会话 JWT 有效期(秒)", 43200),
                        str("basePath", "logout 路径前缀（空=精确匹配 /logout）"),
                        str("logoutRedirect", "logout 后跳转地址（空=200 JSON）"))));
        register(new BuiltinType("watermark", "安全水印插件", "POST", "HTML 响应注入水印 JS（stripCsp=true 时移除 CSP 头）",
                obj(str("org", "组织名称"), str("color", "水印颜色"),
                        num("width", "水印宽度"), num("height", "水印高度"),
                        num("fontSize", "字号"), num("rotate", "旋转角度"),
                        str("scriptUrl", "自定义水印脚本 URL"),
                        strDef("sessionCookieName", "会话 Cookie 名", "fu-gw-token"),
                        boolDef("stripCsp", "剥离 CSP 头", false))));
    }

    public List<BuiltinType> listAll() {
        return List.copyOf(types.values());
    }

    public BuiltinType get(String pluginId) {
        return types.get(pluginId);
    }

    private void register(BuiltinType t) {
        types.put(t.pluginId(), t);
    }

    // ---- JSON Schema builders ----

    private String obj(String... fields) {
        return "{\"type\":\"object\",\"properties\":{" + String.join(",", fields) + "}}";
    }

    private String props(String... entries) {
        return String.join(",", entries);
    }

    private String field(String name, String title, String schema) {
        return "\"" + name + "\":" + schema.replace("\"@t\"", "\"" + title + "\"");
    }

    private String str(String name, String title) {
        return field(name, title, "{\"type\":\"string\",\"title\":\"@t\"}");
    }

    private String num(String name, String title) {
        return field(name, title, "{\"type\":\"integer\",\"title\":\"@t\"}");
    }

    private String bool(String name, String title) {
        return field(name, title, "{\"type\":\"boolean\",\"title\":\"@t\"}");
    }

    private String arr(String name, String title) {
        return field(name, title, "{\"type\":\"array\",\"items\":{\"type\":\"string\"},\"title\":\"@t\"}");
    }

    private String mapOfStr(String name, String title) {
        return field(name, title, "{\"type\":\"object\",\"additionalProperties\":{\"type\":\"string\"},\"title\":\"@t\"}");
    }

    // ---- 带缺省值 / 敏感键形态（S11 补强键）----

    private String strDef(String name, String title, String def) {
        return field(name, title, "{\"type\":\"string\",\"title\":\"@t\",\"default\":\"" + def + "\"}");
    }

    private String numDef(String name, String title, long def) {
        return field(name, title, "{\"type\":\"integer\",\"title\":\"@t\",\"default\":" + def + "}");
    }

    private String boolDef(String name, String title, boolean def) {
        return field(name, title, "{\"type\":\"boolean\",\"title\":\"@t\",\"default\":" + def + "}");
    }

    /** 敏感键：password 形态 + 注明加密存储（gw_plugin.config 列 [ENCRYPT: AES-256-GCM]）。 */
    private String pwdEnc(String name, String title, String desc) {
        return field(name, title, "{\"type\":\"string\",\"format\":\"password\",\"title\":\"@t\","
                + "\"description\":\"" + desc + "；加密存储（AES-256-GCM）\"}");
    }

    private String en(String name, String title, String... values) {
        String enumJson = java.util.Arrays.stream(values)
                .map(v -> "\"" + v + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
        return field(name, title, "{\"type\":\"string\",\"enum\":" + enumJson + ",\"title\":\"@t\"}");
    }
}
