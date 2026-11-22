package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S11-1 T 步契约测试（RED 先行，§9 差量补强）。C 步按本文件钉死的口径实现：
 *
 * <pre>
 * §1 state CSRF（self-contained，网关多实例无共享存储）：
 *    state = random + "." + timestamp秒 + "." + base64url(redirect) + "." + base64url(HMAC-SHA256)
 *    MAC 密钥 = config.stateSecret（缺省时从 appSecret 派生，实现自裁决派生式，但两端必须一致）；
 *    MAC 输入 = random + "." + timestamp + "." + redirect 原文（非 Base64URL 形态）；
 *    random ≥16 字符；时效默认 300s（config.stateTimeout，单位秒）；redirect=完整当前 URL（含 query）。
 *    回调 ？authCode= 必须携带合法 state：缺失/篡改/过期 → 401 JSON（含 "state validation failed"），
 *    浏览器也不得再 302；通过后 302 回 redirect（state 内完整原 URL）。
 * §2 redirect 保真：发起时把完整当前 URL（含 query）编入 state；登录成功 302 回完整原 URL。
 * §3 corpId：config.corpId 非空时，回调用户信息 corpId 不一致 → 401 JSON（message 含 corpId），不下发 cookie。
 * §4 JWT 自签会话：config.jwtSecret（缺省回落 appSecret 且日志警告）；回调成功后自签 HS256 JWT 写入
 *    会话 cookie（HttpOnly=true），claims=unionId/nick/corpId/mobile（如有）+ iss=dingtalk（pluginId）
 *    + exp（config.tokenTimeout，单位秒，缺省 43200=12h）；后续请求 token（cookie/Bearer 双通道）
 *    校验=验签+时效，通过则注入 X-User=unionId、X-User-Nick=nick 后放行。
 * §5 logout：路径 = {config.basePath}/logout（basePath 可空缺省 ""，即 /logout，精确匹配）；
 *    清会话 cookie（maxAge=0）+ 200 JSON；config.logoutRedirect 非空时改 302 到该地址。
 * §6 401 JSON 分流：token 换取失败/验签失败时——Accept 含 text/html（浏览器）→ 保持 302 重新登录；
 *    非浏览器（API/XHR，如 Accept: application/json）→ 401 + application/json body（{"code":401,"message":..}）
 *    + 清会话 cookie（maxAge=0）。
 * §7 既有锚：未登录浏览器 302 跳钉钉 / OPTIONS 豁免 / excludePaths / excludeFileExt / cookie 下发 全部不回退。
 *
 * 测试惯例：MockServerWebExchange + 反射注入私有 webClient 字段（现插件 onConfigChange 内部自建
 * WebClient 且钉死 api.dingtalk.com 真实 URL，无法本地拦截）——用 JDK Proxy 伪造 WebClient 流式链，
 * 零新增第三方依赖。密钥/URL 全部 dummy，不携带源项目真实值。
 * </pre>
 */
class DingTalkPluginScgAuthTest {

    private static final String STATE_SECRET = "test-state-secret";
    private static final String JWT_SECRET = "test-jwt-secret";
    private static final String APP_SECRET = "test-app-secret";
    private static final String COOKIE = "fu-gw-token";
    private static final String ISSUER = "dingtalk";
    private static final String ORIGINAL_URL = "http://localhost/api/protected?foo=bar&baz=qux";
    private static final String BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    private static final String API_ACCEPT = "application/json";
    private static final String ACCESS_TOKEN = "dt-access-token-1";

    private DingTalkPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new DingTalkPlugin();
    }

    // ---------------------------------------------------------------- helpers

    private PluginChain passThrough() {
        return exchange -> Mono.empty();
    }

    private PluginChain captureChain(AtomicReference<ServerHttpRequest> captured) {
        return exchange -> {
            captured.set(exchange.getRequest());
            return Mono.empty();
        };
    }

    /** 新契约键（stateSecret/jwtSecret/tokenTimeout/corpId/basePath/logoutRedirect）暂无 setter，
     *  经 JSON 直接下发（JsonUtils 已禁用未知键失败），C 步落 config 字段后行为生效。 */
    private void configure(Map<String, Object> overrides) {
        Map<String, Object> kv = new LinkedHashMap<>();
        kv.put("appKey", "test-app-key");
        kv.put("appSecret", APP_SECRET);
        kv.put("loginServer", "http://gw.example.test");
        kv.putAll(overrides);
        plugin.onConfigChange(new PluginConfig("dingtalk", JsonUtils.toCompactJson(kv), 1L));
    }

    private void injectWebClient(WebClient fake) {
        try {
            Field f = DingTalkPlugin.class.getDeclaredField("webClient");
            f.setAccessible(true);
            f.set(plugin, fake);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, Object> defaultUser() {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("nick", "tester-one");
        user.put("unionId", "u-union-1");
        user.put("corpId", "corp-ok");
        user.put("mobile", "138-0000-0000");
        return user;
    }

    private MockServerWebExchange get(String url, String accept) {
        MockServerHttpRequest.BaseBuilder<?> b = MockServerHttpRequest.get(url);
        if (accept != null) b.header("Accept", accept);
        return MockServerWebExchange.builder(b.build()).build();
    }

    private MockServerWebExchange getWithCookie(String url, String accept, String cookieValue) {
        MockServerHttpRequest.BaseBuilder<?> b = MockServerHttpRequest.get(url);
        if (accept != null) b.header("Accept", accept);
        b.cookie(new HttpCookie(COOKIE, cookieValue));
        return MockServerWebExchange.builder(b.build()).build();
    }

    private MockServerWebExchange getWithBearer(String url, String accept, String token) {
        MockServerHttpRequest.BaseBuilder<?> b = MockServerHttpRequest.get(url);
        if (accept != null) b.header("Accept", accept);
        b.header("Authorization", "Bearer " + token);
        return MockServerWebExchange.builder(b.build()).build();
    }

    /** 一轮完整登录：发起（无 token）→ 取 state → 携 authCode+state 回调（钉钉出站走 fake）。 */
    private RoundTrip roundTrip(Map<String, Object> overrides,
                                Map<String, Object> tokenResponse,
                                Map<String, Object> userResponse,
                                String callbackAccept) {
        configure(overrides);
        AtomicBoolean outbound = new AtomicBoolean(false);
        injectWebClient(fakeDingApi(tokenResponse, userResponse, outbound));

        MockServerWebExchange init = get(ORIGINAL_URL, BROWSER_ACCEPT);
        plugin.execute(init, passThrough()).block();
        assertEquals(HttpStatus.FOUND, init.getResponse().getStatusCode(), "initiation must 302 to dingtalk");
        String state = stateParamOf(init.getResponse().getHeaders().getFirst("Location"));
        assertNotNull(state, "initiation must emit state");

        String callbackUrl = "/api/protected?foo=bar&baz=qux&authCode=dt-code-1&state="
                + URLEncoder.encode(state, StandardCharsets.UTF_8);
        MockServerWebExchange callback = get(callbackUrl, callbackAccept);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(callback, captureChain(chained)).block();
        return new RoundTrip(callback, chained, outbound, state);
    }

    private record RoundTrip(MockServerWebExchange exchange,
                             AtomicReference<ServerHttpRequest> chained,
                             AtomicBoolean outboundCalled,
                             String stateUsed) {
        HttpStatusCode status() { return exchange.getResponse().getStatusCode(); }
        String location() { return exchange.getResponse().getHeaders().getFirst("Location"); }
        ResponseCookie cookie() { return exchange.getResponse().getCookies().getFirst(COOKIE); }
        String body() { return exchange.getResponse().getBodyAsString().block(); }
        MediaType contentType() { return exchange.getResponse().getHeaders().getContentType(); }
    }

    private static final Map<String, Object> OK_TOKEN = Map.of("accessToken", ACCESS_TOKEN);

    // ---------------------------------------------------------------- §1 state CSRF

    @Test
    void loginRedirectStateIsSelfContainedHmacSigned() {
        configure(Map.of("stateSecret", STATE_SECRET));

        MockServerWebExchange exchange = get(ORIGINAL_URL, BROWSER_ACCEPT);
        plugin.execute(exchange, passThrough()).block();

        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
        String state = stateParamOf(exchange.getResponse().getHeaders().getFirst("Location"));
        assertNotNull(state);
        String[] seg = state.split("\\.", -1);
        assertEquals(4, seg.length, "state 必须是 random.timestamp.redirect.sig 四段点分");
        assertTrue(seg[0].length() >= 16, "random 段 ≥16 字符");
        long ts = Long.parseLong(seg[1]);
        long now = Instant.now().getEpochSecond();
        assertTrue(Math.abs(now - ts) <= 15, "timestamp 段为秒级当前时间");
        assertEquals(ORIGINAL_URL, b64UrlDecode(seg[2]), "redirect 段=完整当前 URL 的 Base64URL");
        assertEquals(hmacB64(STATE_SECRET, seg[0] + "." + seg[1] + "." + ORIGINAL_URL), seg[3],
                "sig 段=HMAC-SHA256(stateSecret, random+'.'+timestamp+'.'+redirect 原文) 的 Base64URL");
    }

    @Test
    void loginRedirectStateCarriesFullUrlOfThisRequest() {
        configure(Map.of("stateSecret", STATE_SECRET));

        MockServerWebExchange exchange = get("http://localhost/api/orders?status=open&page=2", BROWSER_ACCEPT);
        plugin.execute(exchange, passThrough()).block();

        String state = stateParamOf(exchange.getResponse().getHeaders().getFirst("Location"));
        String[] seg = state.split("\\.", -1);
        assertEquals(4, seg.length);
        assertEquals("http://localhost/api/orders?status=open&page=2", b64UrlDecode(seg[2]),
                "state 内 redirect 必须逐请求保真（不同请求不同 state）");
    }

    @Test
    void callbackWithoutStateRejected401Json() {
        configure(Map.of("stateSecret", STATE_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));

        MockServerWebExchange callback = get("/api/protected?foo=bar&baz=qux&authCode=dt-code-1", BROWSER_ACCEPT);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(callback, captureChain(chained)).block();

        assertEquals(HttpStatus.UNAUTHORIZED, callback.getResponse().getStatusCode(), "缺失 state → 401（浏览器也不得再 302）");
        assertTrue(callback.getResponse().getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON));
        assertTrue(callback.getResponse().getBodyAsString().block().contains("state validation failed"));
        assertNull(chained.get(), "401 不得放行插件链");
    }

    @Test
    void callbackTamperedStateRejected401Json() {
        String[] seg = signedState(STATE_SECRET, "abcdefghij123456", Instant.now().getEpochSecond(), ORIGINAL_URL).split("\\.", -1);
        String tampered = ("X" + seg[0].substring(1)) + "." + seg[1] + "." + seg[2] + "." + seg[3];

        MockServerWebExchange callback = get("/api/protected?foo=bar&baz=qux&authCode=dt-code-1&state="
                + URLEncoder.encode(tampered, StandardCharsets.UTF_8), BROWSER_ACCEPT);
        AtomicBoolean outbound = new AtomicBoolean(false);
        configure(Map.of("stateSecret", STATE_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), outbound));
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(callback, captureChain(chained)).block();

        assertEquals(HttpStatus.UNAUTHORIZED, callback.getResponse().getStatusCode(), "random 段被篡改 → 401");
        assertTrue(callback.getResponse().getBodyAsString().block().contains("state validation failed"));
        assertFalse(outbound.get(), "state 校验失败不得调用钉钉出站");
        assertNull(chained.get());
    }

    @Test
    void callbackForgedSignatureRejected401Json() {
        // 全格式合法但用错误密钥自签（伪造者无 stateSecret 时应被拒）
        String forged = signedState("attacker-owned-secret", "abcdefghij123456",
                Instant.now().getEpochSecond(), ORIGINAL_URL);

        MockServerWebExchange callback = get("/api/protected?foo=bar&baz=qux&authCode=dt-code-1&state="
                + URLEncoder.encode(forged, StandardCharsets.UTF_8), BROWSER_ACCEPT);
        AtomicBoolean outbound = new AtomicBoolean(false);
        configure(Map.of("stateSecret", STATE_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), outbound));
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(callback, captureChain(chained)).block();

        assertEquals(HttpStatus.UNAUTHORIZED, callback.getResponse().getStatusCode(), "他钥伪造签名 → 401");
        assertTrue(callback.getResponse().getBodyAsString().block().contains("state validation failed"));
        assertFalse(outbound.get());
        assertNull(chained.get());
    }

    @Test
    void callbackExpiredStateRejected401Json() {
        String expired = signedState(STATE_SECRET, "abcdefghij123456",
                Instant.now().getEpochSecond() - 400, ORIGINAL_URL);

        MockServerWebExchange callback = get("/api/protected?foo=bar&baz=qux&authCode=dt-code-1&state="
                + URLEncoder.encode(expired, StandardCharsets.UTF_8), BROWSER_ACCEPT);
        AtomicBoolean outbound = new AtomicBoolean(false);
        configure(Map.of("stateSecret", STATE_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), outbound));
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(callback, captureChain(chained)).block();

        assertEquals(HttpStatus.UNAUTHORIZED, callback.getResponse().getStatusCode(), "超 300s 默认时效 → 401");
        assertTrue(callback.getResponse().getBodyAsString().block().contains("state validation failed"));
        assertFalse(outbound.get());
        assertNull(chained.get());
    }

    @Test
    void stateSecretDefaultsToAppSecretDerivation() {
        // 不配 stateSecret：发起→回调 round-trip 必须以 appSecret 派生密钥自洽（两端一致）
        RoundTrip rt = roundTrip(Map.of(), OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        assertEquals(HttpStatus.FOUND, rt.status(), "合法 state 回调 → 302 回原 URL");
        assertEquals(ORIGINAL_URL, rt.location());
        assertNotNull(rt.cookie(), "成功登录下发会话 cookie");
        assertEquals(3, rt.cookie().getValue().split("\\.", -1).length, "cookie 值=三段 JWT");
        assertNull(rt.chained.get(), "回调本身 302，不代理");
        assertTrue(rt.outboundCalled.get(), "state 通过后换取 token");
    }

    // ---------------------------------------------------------------- §2 redirect 保真

    @Test
    void callbackSuccessRedirectsToFullOriginalUrlWithQuery() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        assertEquals(HttpStatus.FOUND, rt.status());
        assertEquals(ORIGINAL_URL, rt.location(), "登录成功 302 回完整原 URL（含 query，非 loginServer+path 拼接）");
        assertNotNull(rt.cookie());
        assertNull(rt.chained.get());
        assertTrue(rt.outboundCalled.get());
    }

    // ---------------------------------------------------------------- §3 corpId 校验

    @Test
    void callbackCorpIdMismatchRejected401Json() {
        Map<String, Object> evilUser = new LinkedHashMap<>(defaultUser());
        evilUser.put("corpId", "corp-evil");
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET, "corpId", "corp-ok"),
                OK_TOKEN, evilUser, BROWSER_ACCEPT);

        assertEquals(HttpStatus.UNAUTHORIZED, rt.status(), "corpId 不一致 → 401");
        assertTrue(rt.contentType().isCompatibleWith(MediaType.APPLICATION_JSON));
        assertTrue(rt.body().contains("corpId"), "message 指明 corpId");
        assertNull(rt.cookie(), "拒绝时不下发会话 cookie");
        assertNull(rt.chained.get());
    }

    @Test
    void callbackCorpIdMatchSucceeds() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET, "corpId", "corp-ok"),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        assertEquals(HttpStatus.FOUND, rt.status(), "corpId 一致 → 正常成功路径");
        assertEquals(ORIGINAL_URL, rt.location());
        assertNotNull(rt.cookie());
    }

    // ---------------------------------------------------------------- §4 JWT 自签会话

    @Test
    void callbackIssuesHttpOnlyHmac256JwtCookieWithClaims() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        ResponseCookie cookie = rt.cookie();
        assertNotNull(cookie, "成功登录下发会话 cookie");
        assertTrue(cookie.isHttpOnly(), "gateway4j 口径 HttpOnly=true（水印脚本参数化取值，不读 JWT）");
        String[] parts = cookie.getValue().split("\\.", -1);
        assertEquals(3, parts.length, "JWT 三段");

        Map<String, Object> header = JsonUtils.parseObject(b64UrlDecode(parts[0]), Map.class);
        assertEquals("HS256", header.get("alg"));
        Map<String, Object> claims = JsonUtils.parseObject(b64UrlDecode(parts[1]), Map.class);
        assertEquals("u-union-1", claims.get("unionId"));
        assertEquals("tester-one", claims.get("nick"));
        assertEquals("corp-ok", claims.get("corpId"));
        assertEquals("138-0000-0000", claims.get("mobile"));
        assertEquals(ISSUER, claims.get("iss"), "issuer=pluginId");
        long exp = ((Number) claims.get("exp")).longValue();
        long now = Instant.now().getEpochSecond();
        assertTrue(exp > now + 11 * 3600 && exp < now + 13 * 3600, "缺省 tokenTimeout=12h");
        assertEquals(hmacB64(JWT_SECRET, parts[0] + "." + parts[1]), parts[2], "JWT 签名=HS256(jwtSecret)");
    }

    @Test
    void tokenTimeoutConfigControlsJwtExpiry() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET, "tokenTimeout", 60),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        String[] parts = rt.cookie().getValue().split("\\.", -1);
        assertEquals(3, parts.length, "cookie 值=三段 JWT");
        Map<String, Object> claims = JsonUtils.parseObject(b64UrlDecode(parts[1]), Map.class);
        long exp = ((Number) claims.get("exp")).longValue();
        long now = Instant.now().getEpochSecond();
        assertTrue(exp >= now && exp <= now + 150, "tokenTimeout=60s 时 exp 在 2.5 分钟窗内");
    }

    @Test
    void jwtSecretAbsentFallsBackToAppSecret() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET), OK_TOKEN, defaultUser(), BROWSER_ACCEPT);

        String[] parts = rt.cookie().getValue().split("\\.", -1);
        assertEquals(3, parts.length);
        assertEquals(hmacB64(APP_SECRET, parts[0] + "." + parts[1]), parts[2],
                "jwtSecret 缺省回落 appSecret（实现须另记警告日志，测试不观测日志）");
    }

    @Test
    void validJwtCookieInjectsXUserHeadersOnSubsequentRequest() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);
        String jwt = rt.cookie().getValue();

        MockServerWebExchange next = getWithCookie("/api/protected", BROWSER_ACCEPT, jwt);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(next, captureChain(chained)).block();

        assertNotNull(chained.get(), "有效 JWT → 放行");
        assertEquals("u-union-1", chained.get().getHeaders().getFirst("X-User"), "X-User=unionId（既有头透传锚）");
        assertEquals("tester-one", chained.get().getHeaders().getFirst("X-User-Nick"));
        assertFalse(HttpStatus.FOUND.equals(next.getResponse().getStatusCode()), "不得再 302");
    }

    @Test
    void validJwtBearerTokenInjectsXUserHeaders() {
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                OK_TOKEN, defaultUser(), BROWSER_ACCEPT);
        String jwt = rt.cookie().getValue();

        MockServerWebExchange next = getWithBearer("/api/protected", API_ACCEPT, jwt);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(next, captureChain(chained)).block();

        assertNotNull(chained.get(), "Bearer 通道同样验签放行");
        assertEquals("u-union-1", chained.get().getHeaders().getFirst("X-User"));
        assertEquals("tester-one", chained.get().getHeaders().getFirst("X-User-Nick"));
    }

    @Test
    void expiredJwtBrowserGets302Relogin() {
        String expiredJwt = testJwt(JWT_SECRET, Map.of("unionId", "u-union-1", "nick", "tester-one", "iss", ISSUER),
                Instant.now().getEpochSecond() - 60);

        MockServerWebExchange exchange = getWithCookie("/api/protected", BROWSER_ACCEPT, expiredJwt);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        configure(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));
        plugin.execute(exchange, captureChain(chained)).block();

        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode(), "过期 JWT + 浏览器 → 302 重新登录");
        assertTrue(exchange.getResponse().getHeaders().getFirst("Location").contains("login.dingtalk.com"));
        assertNull(chained.get(), "过期 token 不得放行");
    }

    @Test
    void expiredJwtApiClientGets401JsonWithClearedCookie() {
        String expiredJwt = testJwt(JWT_SECRET, Map.of("unionId", "u-union-1", "nick", "tester-one", "iss", ISSUER),
                Instant.now().getEpochSecond() - 60);

        MockServerWebExchange exchange = getWithCookie("/api/protected", API_ACCEPT, expiredJwt);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        configure(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));
        plugin.execute(exchange, captureChain(chained)).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode(), "过期 JWT + API → 401");
        assertTrue(exchange.getResponse().getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON));
        assertTrue(exchange.getResponse().getBodyAsString().block().contains("message"));
        ResponseCookie cleared = exchange.getResponse().getCookies().getFirst(COOKIE);
        assertNotNull(cleared, "401 分流须清会话 cookie");
        assertTrue(cleared.getMaxAge().isZero(), "清 cookie 口径 maxAge=0");
        assertNull(chained.get());
    }

    // ---------------------------------------------------------------- §5 logout

    @Test
    void logoutClearsSessionCookieAndReturnsJson() {
        configure(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));

        MockServerWebExchange logout = getWithCookie("/logout", BROWSER_ACCEPT, "stale-token");
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(logout, captureChain(chained)).block();

        assertEquals(HttpStatus.OK, logout.getResponse().getStatusCode());
        assertTrue(logout.getResponse().getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON), "200 JSON");
        ResponseCookie cleared = logout.getResponse().getCookies().getFirst(COOKIE);
        assertNotNull(cleared, "logout 清会话 cookie");
        assertTrue(cleared.getMaxAge().isZero(), "maxAge=0");
        assertNull(chained.get(), "logout 端点不进插件链");
    }

    @Test
    void logoutWithRedirectConfigReturns302() {
        configure(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET,
                "logoutRedirect", "http://localhost/goodbye"));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));

        MockServerWebExchange logout = get("/logout", BROWSER_ACCEPT);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(logout, captureChain(chained)).block();

        assertEquals(HttpStatus.FOUND, logout.getResponse().getStatusCode());
        assertEquals("http://localhost/goodbye", logout.getResponse().getHeaders().getFirst("Location"));
        assertNotNull(logout.getResponse().getCookies().getFirst(COOKIE), "302 分支同样清 cookie");
        assertTrue(logout.getResponse().getCookies().getFirst(COOKIE).getMaxAge().isZero());
        assertNull(chained.get());
    }

    @Test
    void logoutRespectsBasePath() {
        configure(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET, "basePath", "/auth"));
        injectWebClient(fakeDingApi(OK_TOKEN, defaultUser(), new AtomicBoolean(false)));

        MockServerWebExchange logout = get("/auth/logout", API_ACCEPT);
        AtomicReference<ServerHttpRequest> chained = new AtomicReference<>();
        plugin.execute(logout, captureChain(chained)).block();

        assertEquals(HttpStatus.OK, logout.getResponse().getStatusCode(), "{basePath}/logout=/{auth}/logout");
        assertNotNull(logout.getResponse().getCookies().getFirst(COOKIE));
        assertTrue(logout.getResponse().getCookies().getFirst(COOKIE).getMaxAge().isZero());
        assertNull(chained.get());
    }

    // ---------------------------------------------------------------- §6 401 JSON 分流

    @Test
    void tokenExchangeFailureBrowserKeeps302Relogin() {
        Map<String, Object> badToken = Map.of("errorCode", "invalid-code");
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                badToken, defaultUser(), BROWSER_ACCEPT);

        assertEquals(HttpStatus.FOUND, rt.status(), "换取失败 + 浏览器 → 保持 302 重新登录");
        assertNotNull(rt.location());
        assertTrue(rt.location().contains("login.dingtalk.com"));
        assertNull(rt.cookie(), "失败不下发会话 cookie");
        assertNull(rt.chained.get());
    }

    @Test
    void tokenExchangeFailureApiClientGets401JsonWithClearedCookie() {
        Map<String, Object> badToken = Map.of("errorCode", "invalid-code");
        RoundTrip rt = roundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET),
                badToken, defaultUser(), API_ACCEPT);

        assertEquals(HttpStatus.UNAUTHORIZED, rt.status(), "换取失败 + 非浏览器 → 401 不再 302");
        assertTrue(rt.contentType().isCompatibleWith(MediaType.APPLICATION_JSON));
        assertTrue(rt.body().contains("message"));
        ResponseCookie cleared = rt.cookie();
        assertNotNull(cleared, "401 分流清会话 cookie");
        assertTrue(cleared.getMaxAge().isZero(), "清 cookie 口径 maxAge=0");
        assertNull(rt.chained.get());
    }

    // ---------------------------------------------------------------- §7 既有锚

    @Test
    void optionsExcludesAndDisabledStillPassThrough() {
        // OPTIONS 豁免
        configure(Map.of("stateSecret", STATE_SECRET));
        MockServerWebExchange options = MockServerWebExchange.builder(
                MockServerHttpRequest.options("/api/protected").build()).build();
        plugin.execute(options, passThrough()).block();
        assertNull(options.getResponse().getStatusCode(), "OPTIONS 豁免");

        // excludePaths / excludeFileExt
        configure(Map.of("stateSecret", STATE_SECRET,
                "excludePaths", java.util.List.of("/public"),
                "excludeFileExt", java.util.List.of(".png")));
        MockServerWebExchange publicPath = get("/public/health", BROWSER_ACCEPT);
        plugin.execute(publicPath, passThrough()).block();
        assertNull(publicPath.getResponse().getStatusCode(), "excludePaths 豁免");
        MockServerWebExchange staticRes = get("/static/logo.png", BROWSER_ACCEPT);
        plugin.execute(staticRes, passThrough()).block();
        assertNull(staticRes.getResponse().getStatusCode(), "excludeFileExt 豁免");

        // disabled
        configure(Map.of("enabled", false));
        MockServerWebExchange disabled = get("/api/protected", BROWSER_ACCEPT);
        plugin.execute(disabled, passThrough()).block();
        assertNull(disabled.getResponse().getStatusCode(), "enabled=false 直通");
    }

    @Test
    void unauthenticatedBrowserStillRedirectsToDingTalkAuthorize() {
        configure(Map.of("stateSecret", STATE_SECRET));

        MockServerWebExchange exchange = get(ORIGINAL_URL, BROWSER_ACCEPT);
        plugin.execute(exchange, passThrough()).block();

        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode(), "未登录浏览器 302 跳钉钉（锚）");
        String location = exchange.getResponse().getHeaders().getFirst("Location");
        assertTrue(location.contains("login.dingtalk.com/oauth2/auth"));
        assertTrue(location.contains("client_id=test-app-key"));
        assertTrue(location.contains("scope=openid"));
        assertTrue(location.contains("redirect_uri="));
        assertNotNull(stateParamOf(location), "state 参数必须存在");
        assertFalse(stateParamOf(location).isEmpty());
    }

    // ---------------------------------------------------------------- 契约工具（JDK only）

    private static String b64UrlDecode(String encoded) {
        return new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
    }

    private static String hmacB64(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 按 §1 钉死口径构造合法 state（过期/伪造对照用）。 */
    private static String signedState(String secret, String random, long timestampSec, String redirect) {
        return random + "." + timestampSec + "." + b64UrlEncode(redirect) + "."
                + hmacB64(secret, random + "." + timestampSec + "." + redirect);
    }

    private static String b64UrlEncode(String raw) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** 测试侧自签 HS256 JWT（过期对照用），与 java-jwt 产物同构。 */
    private static String testJwt(String secret, Map<String, Object> claims, long expEpochSecond) {
        Map<String, Object> payload = new LinkedHashMap<>(claims);
        payload.put("exp", expEpochSecond);
        String head = b64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        String body = b64UrlEncode(JsonUtils.toCompactJson(payload));
        return head + "." + body + "." + hmacB64(secret, head + "." + body);
    }

    private static String stateParamOf(String location) {
        if (location == null) return null;
        String rawQuery = URI.create(location).getRawQuery();
        if (rawQuery == null) return null;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && "state".equals(pair.substring(0, eq))) {
                return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    /** JDK Proxy 伪造钉钉出站（现插件钉死 api.dingtalk.com 真实 URL 且自建 WebClient，
     *  只能反射注入伪造实例；POST→tokenResp，GET→userResp）。 */
    @SuppressWarnings("unchecked")
    private WebClient fakeDingApi(Map<String, Object> tokenResponse,
                                  Map<String, Object> userResponse,
                                  AtomicBoolean outbound) {
        ClassLoader cl = WebClient.class.getClassLoader();
        return (WebClient) Proxy.newProxyInstance(cl, new Class<?>[]{WebClient.class},
                (proxy, method, args) -> {
                    if ("post".equals(method.getName())) return specProxy(cl, "POST", tokenResponse, userResponse, outbound);
                    if ("get".equals(method.getName())) return specProxy(cl, "GET", tokenResponse, userResponse, outbound);
                    return objectOrSelf(proxy, method, args);
                });
    }

    private Object specProxy(ClassLoader cl, String route,
                             Map<String, Object> tokenResponse,
                             Map<String, Object> userResponse,
                             AtomicBoolean outbound) {
        Class<?> iface = "POST".equals(route)
                ? WebClient.RequestBodyUriSpec.class
                : WebClient.RequestHeadersUriSpec.class;
        return Proxy.newProxyInstance(cl, new Class<?>[]{iface}, (proxy, method, args) -> {
            if ("retrieve".equals(method.getName())) {
                return responseProxy(cl, route, tokenResponse, userResponse, outbound);
            }
            return objectOrSelf(proxy, method, args);
        });
    }

    private Object responseProxy(ClassLoader cl, String route,
                                 Map<String, Object> tokenResponse,
                                 Map<String, Object> userResponse,
                                 AtomicBoolean outbound) {
        return Proxy.newProxyInstance(cl, new Class<?>[]{WebClient.ResponseSpec.class},
                (proxy, method, args) -> {
                    if ("bodyToMono".equals(method.getName())) {
                        outbound.set(true);
                        return "POST".equals(route) ? Mono.just(tokenResponse) : Mono.just(userResponse);
                    }
                    return objectOrSelf(proxy, method, args);
                });
    }

    private Object objectOrSelf(Object proxy, Method method, Object[] args) {
        if (method.getDeclaringClass() == Object.class) {
            if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
            if ("equals".equals(method.getName())) return proxy == args[0];
            return "fake-web-client-node";
        }
        return proxy; // uri/bodyValue/header/headers 等 spec 自返方法
    }
}
