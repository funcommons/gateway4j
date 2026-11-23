package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 钉钉 SSO 认证插件（S11-1 补强后口径）：
 *
 * <pre>
 * §1 state CSRF（self-contained，网关多实例无共享存储）：
 *    state = random(≥16) + "." + timestamp(秒) + "." + b64url(完整原 URL) + "." + b64url(HMAC-SHA256)
 *    MAC 密钥 = config.stateSecret，缺省从 appSecret 派生（SHA-256(appSecret) 全 32 字节，两端自洽）；
 *    MAC 输入 = random + "." + timestamp + "." + redirect 原文；时效 config.stateTimeout 秒（缺省 300）。
 * §2 回调 ?authCode= 先做 state 验签（MessageDigest.isEqual 常量时间）+ 时效，再 WebClient 换
 *    token/用户信息（出站前缀=apiBaseUrl，缺省 api.dingtalk.com，尾 '/' 剥除防双斜杠）→
 *    corpId 校验 → 自签 HS256 会话 JWT → HttpOnly cookie →
 *    302 回 state 内完整原 URL（不代理，不进插件链）。
 * §3 鉴权闸门：Bearer/cookie 双源 token，验签+时效；过→注入 X-User/X-User-Nick（先移除既有同名头，
 *    防客户端伪造）放行；败→浏览器（Accept 含 text/html）302 重登，API 401 JSON+清 cookie。
 * §5 logout：{basePath}/logout 精确匹配 → 清 cookie；logoutRedirect 非空→302 该址，否则 200 JSON。
 * §6 既有保留：OPTIONS/excludePaths/excludeFileExt/enabled=false 直通；未登录浏览器 302 跳钉钉。
 * §7 fu-gw-nick 展示 cookie（S11-6）：登录成功（§2 下发 token cookie 处）追加第二个 Set-Cookie——
 *    名 fu-gw-nick、<b>非 HttpOnly</b>（水印脚本需 JS 可读，水印个性化文案由此驱动）、其余属性
 *    镜像 token cookie（Path=/）；值=服务端<b>预脱敏</b>的「maskedNick + "|" + maskedMobile」
 *    先拼接后整体 URLEncoder.encode(UTF_8)（'|'→%7C，WatermarkPlugin 脚本 decode 后再 split，
 *    两端契约互为镜像）；原始 nick/手机号不得进浏览器。读取契约见 WatermarkPlugin 类头。
 * </pre>
 */
public class DingTalkPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(DingTalkPlugin.class);
    /** 出站 API 域名缺省锚：config.apiBaseUrl 未配置时出站 URL 逐字不变。 */
    private static final String DEFAULT_API_BASE_URL = "https://api.dingtalk.com";
    /** 出站路径不变，仅前缀（apiBaseUrl）可配。 */
    private static final String TOKEN_PATH = "/v1.0/oauth2/userAccessToken";
    private static final String USER_PATH = "/v1.0/contact/users/me";
    private static final String OAUTH_AUTHORIZE_URL = "https://login.dingtalk.com/oauth2/auth";

    private static final long DEFAULT_STATE_TIMEOUT_SECONDS = 300;
    private static final long DEFAULT_TOKEN_TIMEOUT_SECONDS = 43200;
    private static final String HEADER_USER = "X-User";
    private static final String HEADER_USER_NICK = "X-User-Nick";
    /** §7 展示专用 cookie 名（非 HttpOnly，值=预脱敏 nick|mobile 的整体 URLEncode，见类头 §7）。 */
    private static final String NICK_COOKIE = "fu-gw-nick";
    private static final SecureRandom RANDOM = new SecureRandom();

    private volatile DingTalkPluginConfig config;
    private volatile WebClient webClient;
    private final AtomicBoolean jwtSecretFallbackWarned = new AtomicBoolean(false);

    public DingTalkPlugin() {
        super(BuiltinPluginConstants.DINGTALK, "钉钉认证插件", "PRE", 2);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || !config.isEnabled()) {
            return chain.execute(exchange);
        }
        if (isExcluded(exchange)) {
            return chain.execute(exchange);
        }
        if (isLogoutPath(exchange)) {
            return handleLogout(exchange);
        }

        String authCode = exchange.getRequest().getQueryParams().getFirst("authCode");
        if (authCode != null && !authCode.isEmpty()) {
            return handleCallback(exchange, authCode,
                    exchange.getRequest().getQueryParams().getFirst("state"));
        }

        String token = resolveToken(exchange);
        if (token == null || token.isEmpty()) {
            return redirectToLogin(exchange);
        }

        Map<String, Object> claims = verifyJwt(token);
        if (claims == null) {
            log.warn("DingTalk session token invalid or expired");
            return authFailure(exchange, "session token invalid or expired");
        }

        ServerHttpRequest mutatedRequest = injectUserHeaders(exchange, claims);
        return chain.execute(exchange.mutate().request(mutatedRequest).build());
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), DingTalkPluginConfig.class);
        if (this.config != null && this.config.getAppKey() != null) {
            this.webClient = WebClient.builder().build();
        }
    }

    // ---------------------------------------------------------------- 排除/端点判定

    private boolean isExcluded(ServerWebExchange exchange) {
        String method = exchange.getRequest().getMethod().name();
        if ("OPTIONS".equals(method)) {
            return true;
        }
        String path = exchange.getRequest().getPath().value();
        if (config.getExcludePaths() != null) {
            for (String p : config.getExcludePaths()) {
                if (path.startsWith(p)) return true;
            }
        }
        if (config.getExcludeFileExt() != null) {
            for (String ext : config.getExcludeFileExt()) {
                if (path.endsWith(ext)) return true;
            }
        }
        return false;
    }

    private boolean isLogoutPath(ServerWebExchange exchange) {
        String basePath = config.getBasePath() == null ? "" : config.getBasePath().trim();
        while (basePath.endsWith("/")) {
            basePath = basePath.substring(0, basePath.length() - 1);
        }
        return (basePath + "/logout").equals(exchange.getRequest().getPath().value());
    }

    /** 出站 API 域名前缀：config.apiBaseUrl 优先（剥尾 '/' 防拼接双斜杠），空缺省回落 api.dingtalk.com。 */
    private String apiBaseUrl() {
        String base = config.getApiBaseUrl() == null ? "" : config.getApiBaseUrl().trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base.isEmpty() ? DEFAULT_API_BASE_URL : base;
    }

    // ---------------------------------------------------------------- token 双源

    private String resolveToken(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(config.getCookieName());
        return cookie != null ? cookie.getValue() : null;
    }

    private ServerHttpRequest injectUserHeaders(ServerWebExchange exchange, Map<String, Object> claims) {
        ServerHttpRequest.Builder builder = exchange.getRequest().mutate();
        // 先移除客户端自带的同名头，防伪造透传，再以下发会话 claims 为准
        builder.headers(headers -> {
            headers.remove(HEADER_USER);
            headers.remove(HEADER_USER_NICK);
        });
        String unionId = nullable(claims.get("unionId"));
        String nick = nullable(claims.get("nick"));
        if (unionId != null) builder.header(HEADER_USER, unionId);
        if (nick != null) builder.header(HEADER_USER_NICK, nick);
        return builder.build();
    }

    // ---------------------------------------------------------------- 302 跳登录（§1/§2/§7）

    private Mono<Void> redirectToLogin(ServerWebExchange exchange) {
        String currentUrl = exchange.getRequest().getURI().toString();
        String state = buildState(currentUrl);
        String redirectUri = URLEncoder.encode(currentUrl, StandardCharsets.UTF_8);
        String stateParam = URLEncoder.encode(state, StandardCharsets.UTF_8);
        String loginUrl = OAUTH_AUTHORIZE_URL
                + "?redirect_uri=" + redirectUri
                + "&response_type=code"
                + "&client_id=" + config.getAppKey()
                + "&scope=openid"
                + "&state=" + stateParam
                + "&prompt=consent";

        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(URI.create(loginUrl));
        return exchange.getResponse().setComplete();
    }

    private String buildState(String currentUrl) {
        String random = newRandomSegment();
        long timestamp = Instant.now().getEpochSecond();
        String redirectB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(currentUrl.getBytes(StandardCharsets.UTF_8));
        String sig = hmacB64(stateSecretBytes(), random + "." + timestamp + "." + currentUrl);
        return random + "." + timestamp + "." + redirectB64 + "." + sig;
    }

    /** 验签+时效，通过返回 redirect 原文（完整原 URL），否则 null。 */
    private String verifyState(String state) {
        if (state == null || state.isEmpty()) {
            return null;
        }
        String[] seg = state.split("\\.", -1);
        if (seg.length != 4) {
            return null;
        }
        String random = seg[0];
        long timestamp;
        try {
            timestamp = Long.parseLong(seg[1]);
        } catch (NumberFormatException e) {
            return null;
        }
        if (Math.abs(Instant.now().getEpochSecond() - timestamp) > stateTimeoutSeconds()) {
            return null;
        }
        byte[] redirectBytes;
        try {
            redirectBytes = Base64.getUrlDecoder().decode(seg[2]);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String redirect = new String(redirectBytes, StandardCharsets.UTF_8);
        String expectedSig = hmacB64(stateSecretBytes(), random + "." + timestamp + "." + redirect);
        if (!MessageDigest.isEqual(expectedSig.getBytes(StandardCharsets.UTF_8),
                seg[3].getBytes(StandardCharsets.UTF_8))) {
            return null;
        }
        return redirect;
    }

    private String newRandomSegment() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        // 16 字节 → 22 个 Base64URL 字符（无 padding，不含 "."），满足 ≥16 且不打乱四段点分
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** state HMAC 密钥：config.stateSecret 优先，缺省派生 SHA-256(appSecret)（32 字节）。 */
    private byte[] stateSecretBytes() {
        String secret = config.getStateSecret();
        if (secret == null || secret.isEmpty()) {
            try {
                return MessageDigest.getInstance("SHA-256")
                        .digest(str(config.getAppSecret()).getBytes(StandardCharsets.UTF_8));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 unavailable", e);
            }
        }
        return secret.getBytes(StandardCharsets.UTF_8);
    }

    private long stateTimeoutSeconds() {
        long t = config.getStateTimeout();
        return t > 0 ? t : DEFAULT_STATE_TIMEOUT_SECONDS;
    }

    // ---------------------------------------------------------------- 回调（§2/§3）

    private Mono<Void> handleCallback(ServerWebExchange exchange, String authCode, String state) {
        // 先 state 四段验签/时效，通过前不得出站、不得下发凭据
        String redirect = verifyState(state);
        if (redirect == null) {
            log.warn("DingTalk callback state validation failed");
            return writeJson(exchange, 401, "state validation failed");
        }
        if (webClient == null) {
            log.warn("DingTalk webClient not initialized");
            return authFailure(exchange, "dingtalk auth not initialized");
        }
        Map<String, String> tokenRequest = Map.of(
                "clientId", config.getAppKey(),
                "clientSecret", config.getAppSecret(),
                "code", authCode,
                "grantType", "authorization_code"
        );

        // 出站链抽成具名落点（tokenMono/userSession），规避 javac 对 lambda 套 lambda 的裸型归因
        // （内层 lambda 参数被三参方法消费时，外层 onErrorResume 的 e 会被推成 Object）
        Mono<Map> tokenMono = webClient.post()
                .uri(apiBaseUrl() + TOKEN_PATH)
                .bodyValue(tokenRequest)
                .retrieve()
                .bodyToMono(Map.class);
        return tokenMono.flatMap(tokenResp -> {
            String accessToken = (String) tokenResp.get("accessToken");
            if (accessToken == null || accessToken.isEmpty()) {
                log.warn("DingTalk token exchange failed: {}", tokenResp);
                return authFailure(exchange, "dingtalk token exchange failed");
            }
            Mono<Map> userMono = webClient.get()
                    .uri(apiBaseUrl() + USER_PATH)
                    .header("x-acs-dingtalk-access-token", accessToken)
                    .retrieve()
                    .bodyToMono(Map.class);
            return userSession(exchange, userMono, redirect)
                    .onErrorResume(e -> {
                        log.warn("DingTalk user info error: {}", e.getMessage());
                        return authFailure(exchange, "dingtalk user info fetch failed: " + e.getMessage());
                    });
        })
        .onErrorResume(e -> {
            log.warn("DingTalk auth error: {}", e.getMessage());
            return authFailure(exchange, "dingtalk token exchange error: " + e.getMessage());
        });
    }

    /** 用户信息消费落点：corpId 校验 → 签发 JWT → cookie → 302 回原 URL。 */
    private Mono<Void> userSession(ServerWebExchange exchange, Mono<Map> userMono, String redirect) {
        return userMono.flatMap(userInfo -> onUserInfo(exchange, userInfo, redirect));
    }

    /** corpId 校验（授权失败，无论浏览器/API 一律 401 JSON）→ 签发 JWT → cookie → 302 回原 URL。 */
    private Mono<Void> onUserInfo(ServerWebExchange exchange, Map<String, Object> userInfo, String redirect) {
        String configuredCorpId = config.getCorpId();
        if (configuredCorpId != null && !configuredCorpId.isEmpty()) {
            String userCorpId = str(userInfo.get("corpId"));
            if (!configuredCorpId.equals(userCorpId)) {
                log.warn("DingTalk corpId mismatch: expected={}, actual={}", configuredCorpId, userCorpId);
                return writeJson(exchange, 401,
                        "corpId mismatch: expected " + configuredCorpId + ", got " + userCorpId);
            }
        }
        String jwt = issueJwt(userInfo);
        exchange.getResponse().addCookie(ResponseCookie.from(sessionCookieName(), jwt)
                .path("/").httpOnly(true).build());
        // §7（S11-6）：追加展示 cookie——非 HttpOnly（水印脚本 JS 可读），属性镜像 token cookie（Path=/），
        // 值为服务端预脱敏结果，原始 PII 不进浏览器（契约见类头 §7 与 WatermarkPlugin）
        exchange.getResponse().addCookie(ResponseCookie.from(NICK_COOKIE, displayCookieValue(userInfo))
                .path("/").build());
        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(URI.create(redirect));
        return exchange.getResponse().setComplete();
    }

    /**
     * §7（S11-6）fu-gw-nick 展示 cookie 值：脱敏 nick + "|" + 脱敏 mobile <b>先拼接后整体</b>
     * URLEncoder.encode(UTF_8)（'|'→%7C；水印脚本 decodeURIComponent 后再 split('|')——两端约定，
     * 与 WatermarkPlugin 脚本互为镜像）。任一段为 null/空串则该段留空（"|138****8000" / "张*|" / "|"），
     * 脚本侧容忍空段（nick 段空 → 回落既有 JWT/静态文案路径）。
     */
    private String displayCookieValue(Map<String, Object> userInfo) {
        String maskedNick = maskNickForDisplay(nullable(userInfo.get("nick")));
        String maskedMobile = maskMobileForDisplay(nullable(userInfo.get("mobile")));
        return URLEncoder.encode(maskedNick + "|" + maskedMobile, StandardCharsets.UTF_8);
    }

    /** 展示脱敏 nick（与水印脚本 JWT 回退路径 maskName 同规则）：length≥2 → 首 + "*" + 余字，否则原值；空段留空。 */
    private static String maskNickForDisplay(String nick) {
        if (nick == null || nick.isEmpty()) {
            return "";
        }
        return nick.length() >= 2 ? nick.charAt(0) + "*" + nick.substring(2) : nick;
    }

    /** 展示脱敏手机（与水印脚本 JWT 回退路径 maskMobile 同规则）：length≥11 → 前 3 + "****" + 后 4，否则原值；空段留空。 */
    private static String maskMobileForDisplay(String mobile) {
        if (mobile == null || mobile.isEmpty()) {
            return "";
        }
        return mobile.length() >= 11
                ? mobile.substring(0, 3) + "****" + mobile.substring(mobile.length() - 4)
                : mobile;
    }

    // ---------------------------------------------------------------- 会话 JWT（§4）

    private String issueJwt(Map<String, Object> userInfo) {
        long expiresAt = Instant.now().getEpochSecond() + tokenTimeoutSeconds();
        Map<String, Object> claims = new LinkedHashMap<>();
        String unionId = nullable(userInfo.get("unionId"));
        String nick = nullable(userInfo.get("nick"));
        String corpId = nullable(userInfo.get("corpId"));
        String mobile = nullable(userInfo.get("mobile"));
        if (unionId != null) claims.put("unionId", unionId);
        if (nick != null) claims.put("nick", nick);
        if (corpId != null) claims.put("corpId", corpId);
        if (mobile != null) claims.put("mobile", mobile);
        claims.put("iss", pluginId());
        claims.put("exp", expiresAt);

        String head = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String body = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(JsonUtils.toCompactJson(claims).getBytes(StandardCharsets.UTF_8));
        return head + "." + body + "." + hmacB64(jwtSecretBytes(), head + "." + body);
    }

    /** 验签+时效，通过返回 claims，否则 null。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> verifyJwt(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        String expectedSig = hmacB64(jwtSecretBytes(), parts[0] + "." + parts[1]);
        if (!MessageDigest.isEqual(expectedSig.getBytes(StandardCharsets.UTF_8),
                parts[2].getBytes(StandardCharsets.UTF_8))) {
            return null;
        }
        Map<String, Object> claims;
        try {
            claims = JsonUtils.parseObject(
                    new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8), Map.class);
        } catch (RuntimeException e) {
            return null;
        }
        if (claims == null) {
            return null;
        }
        Object exp = claims.get("exp");
        if (!(exp instanceof Number number) || number.longValue() <= Instant.now().getEpochSecond()) {
            return null;
        }
        return claims;
    }

    /** 会话 JWT 密钥：config.jwtSecret 优先；缺省回落 appSecret 且警告一次。 */
    private byte[] jwtSecretBytes() {
        String secret = config.getJwtSecret();
        if (secret == null || secret.isEmpty()) {
            if (jwtSecretFallbackWarned.compareAndSet(false, true)) {
                log.warn("DingTalk jwtSecret not configured, falling back to appSecret for HS256 session JWT"
                        + " - configure jwtSecret explicitly in production");
            }
            secret = config.getAppSecret();
        }
        return str(secret).getBytes(StandardCharsets.UTF_8);
    }

    private long tokenTimeoutSeconds() {
        long t = config.getTokenTimeout();
        return t > 0 ? t : DEFAULT_TOKEN_TIMEOUT_SECONDS;
    }

    // ---------------------------------------------------------------- 401 分流 + logout（§5/§6）

    /** 浏览器（Accept 含 text/html）→ 302 重登；API → 清 cookie + 401 JSON。 */
    private Mono<Void> authFailure(ServerWebExchange exchange, String message) {
        if (isBrowser(exchange)) {
            return redirectToLogin(exchange);
        }
        clearSessionCookie(exchange);
        return writeJson(exchange, 401, message);
    }

    private Mono<Void> handleLogout(ServerWebExchange exchange) {
        clearSessionCookie(exchange);
        String redirect = config.getLogoutRedirect();
        if (redirect != null && !redirect.isEmpty()) {
            exchange.getResponse().setStatusCode(HttpStatus.FOUND);
            exchange.getResponse().getHeaders().setLocation(URI.create(redirect));
            return exchange.getResponse().setComplete();
        }
        return writeJson(exchange, 200, "logged out");
    }

    private void clearSessionCookie(ServerWebExchange exchange) {
        exchange.getResponse().addCookie(ResponseCookie.from(sessionCookieName(), "")
                .path("/").httpOnly(true).maxAge(Duration.ZERO).build());
        // §7（S11-6）：展示 cookie 同步过期清除（非 HttpOnly，同一 maxAge=0 手法）
        exchange.getResponse().addCookie(ResponseCookie.from(NICK_COOKIE, "")
                .path("/").maxAge(Duration.ZERO).build());
    }

    private String sessionCookieName() {
        return config.getCookieName() != null ? config.getCookieName() : "fu-gw-token";
    }

    private boolean isBrowser(ServerWebExchange exchange) {
        String accept = exchange.getRequest().getHeaders().getFirst("Accept");
        return accept != null && accept.contains("text/html");
    }

    private Mono<Void> writeJson(ServerWebExchange exchange, int code, String message) {
        exchange.getResponse().setStatusCode(HttpStatus.valueOf(code));
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String body = "{\"code\":" + code + ",\"message\":\"" + jsonEscape(message) + "\"}";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        return exchange.getResponse().writeWith(
                Mono.just(exchange.getResponse().bufferFactory().wrap(bytes)));
    }

    // ---------------------------------------------------------------- 工具（JDK only）

    private static String str(Object value) {
        return value != null ? value.toString() : "";
    }

    /** claims/用户信息取值：null 透传（缺省即不下发，与 str() 的空串口径区分）。 */
    private static String nullable(Object value) {
        return value != null ? value.toString() : null;
    }

    private static String hmacB64(byte[] secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String jsonEscape(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.toString();
    }
}
