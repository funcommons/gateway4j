package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S11-4a T 步契约测试（RED 先行）：钉钉插件出站 API 域名可配（apiBaseUrl）。C 步按本文件钉死的口径实现：
 *
 * <pre>
 * §1 DingTalkPluginConfig 新键 apiBaseUrl：出站 API 域名前缀，缺省 https://api.dingtalk.com
 *    （缺省锚——不配置时既有行为/URL 逐字不变，ScgAuthTest 24 + DingTalkPluginTest 8 全绿是硬锚）。
 * §2 出站 URL = apiBaseUrl + "/v1.0/oauth2/userAccessToken" 与 apiBaseUrl + "/v1.0/contact/users/me"
 *    （路径不变，仅前缀可配）；dev/测试环境指向本地 mock（如 http://127.0.0.1:9390）即可走通全链路。
 * §3 尾斜杠容忍：apiBaseUrl 以 "/" 结尾时拼接不得出现双斜杠（//v1.0/... 拒绝）。
 * §4 热生效：apiBaseUrl 修改经 onConfigChange 注入后立即生效（下一次出站即用新前缀）。
 * </pre>
 *
 * 测试惯例：沿用 DingTalkPluginScgAuthTest 手法——MockServerWebExchange + 反射注入私有 webClient 字段
 * （现插件 onConfigChange 内自建 WebClient 且钉死 api.dingtalk.com 真实 URL，无法本地拦截），
 * 用 JDK Proxy 伪造 WebClient 流式链，并在 uri(String) 落点捕获出站 URL 逐字断言。零新增第三方依赖。
 * 密钥/URL 全部 dummy，不携带源项目真实值。
 */
class DingTalkPluginApiBaseUrlTest {

    private static final String STATE_SECRET = "test-state-secret";
    private static final String JWT_SECRET = "test-jwt-secret";
    private static final String COOKIE = "fu-gw-token";
    private static final String ORIGINAL_URL = "http://localhost/api/protected?foo=bar";
    private static final String BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

    /** 缺省锚：与现实现钉死的真实域名逐字一致（零变化锚）。 */
    private static final String DEFAULT_BASE = "https://api.dingtalk.com";
    private static final String MOCK_BASE = "http://127.0.0.1:9390";
    private static final String TOKEN_PATH = "/v1.0/oauth2/userAccessToken";
    private static final String USER_PATH = "/v1.0/contact/users/me";

    private DingTalkPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new DingTalkPlugin();
    }

    // ---------------------------------------------------------------- helpers

    private PluginChain passThrough() {
        return exchange -> Mono.empty();
    }

    /** 新契约键 apiBaseUrl 暂无 config 字段，经 JSON 直接下发（JsonUtils 已禁用未知键失败），
     *  C 步落 DingTalkPluginConfig 字段后行为生效。 */
    private void configure(Map<String, Object> overrides) {
        Map<String, Object> kv = new LinkedHashMap<>();
        kv.put("appKey", "test-app-key");
        kv.put("appSecret", "test-app-secret");
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

    private MockServerWebExchange get(String url, String accept) {
        MockServerHttpRequest.BaseBuilder<?> b = MockServerHttpRequest.get(url);
        if (accept != null) b.header("Accept", accept);
        return MockServerWebExchange.builder(b.build()).build();
    }

    /** 一轮完整登录：发起（无 token）→ 取 state → 携 authCode+state 回调（出站走 fake 并捕获 URL）。
     *  captured 按出站顺序收 URL：[0]=换 token（POST），[1]=取用户信息（GET）。 */
    private MockServerWebExchange callbackRoundTrip(Map<String, Object> overrides, List<String> captured) {
        configure(overrides);
        injectWebClient(fakeDingApi(captured));

        MockServerWebExchange init = get(ORIGINAL_URL, BROWSER_ACCEPT);
        plugin.execute(init, passThrough()).block();
        assertEquals(HttpStatus.FOUND, init.getResponse().getStatusCode(), "发起必须 302 跳钉钉");
        String state = stateParamOf(init.getResponse().getHeaders().getFirst("Location"));
        assertNotNull(state, "发起必须下发 state");

        String callbackUrl = "/api/protected?foo=bar&authCode=dt-code-1&state="
                + URLEncoder.encode(state, StandardCharsets.UTF_8);
        MockServerWebExchange callback = get(callbackUrl, BROWSER_ACCEPT);
        plugin.execute(callback, passThrough()).block();
        return callback;
    }

    private static final Map<String, Object> OK_TOKEN = Map.of("accessToken", "dt-mock-token");

    private static Map<String, Object> defaultUser() {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("nick", "tester-one");
        user.put("unionId", "u-union-1");
        user.put("corpId", "corp-ok");
        return user;
    }

    // ---------------------------------------------------------------- §2 前缀可配

    @Test
    void customApiBaseUrlDrivesBothOutboundUrls() {
        List<String> captured = new ArrayList<>();
        callbackRoundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET,
                "apiBaseUrl", MOCK_BASE), captured);

        assertEquals(2, captured.size(), "一轮回调=换 token + 取用户信息两次出站");
        assertEquals(MOCK_BASE + TOKEN_PATH, captured.get(0),
                "换 token 出站 URL 前缀=apiBaseUrl（路径逐字不变）");
        assertEquals(MOCK_BASE + USER_PATH, captured.get(1),
                "取用户信息出站 URL 前缀=apiBaseUrl（路径逐字不变）");
    }

    // ---------------------------------------------------------------- §1 缺省锚（零变化）

    @Test
    void absentApiBaseUrlKeepsLegacyRealDomainUrls() {
        List<String> captured = new ArrayList<>();
        callbackRoundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET), captured);

        assertEquals(2, captured.size());
        assertEquals(DEFAULT_BASE + TOKEN_PATH, captured.get(0),
                "缺省锚：不配 apiBaseUrl 时换 token 出站 URL 逐字不变");
        assertEquals(DEFAULT_BASE + USER_PATH, captured.get(1),
                "缺省锚：不配 apiBaseUrl 时取用户信息出站 URL 逐字不变");
    }

    // ---------------------------------------------------------------- §3 尾斜杠容忍

    @Test
    void trailingSlashApiBaseUrlDoesNotProduceDoubleSlash() {
        List<String> captured = new ArrayList<>();
        callbackRoundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET,
                "apiBaseUrl", MOCK_BASE + "/"), captured);

        assertEquals(2, captured.size());
        for (String url : captured) {
            assertFalse(url.contains("//v1.0"), "尾斜杠拼接不得出现双斜杠 //v1.0：实际=" + url);
        }
        assertEquals(MOCK_BASE + TOKEN_PATH, captured.get(0), "尾斜杠归一后换 token URL=单斜杠拼接");
        assertEquals(MOCK_BASE + USER_PATH, captured.get(1), "尾斜杠归一后取用户信息 URL=单斜杠拼接");
    }

    // ---------------------------------------------------------------- §4 onConfigChange 热生效

    @Test
    void apiBaseUrlChangeTakesEffectViaOnConfigChange() {
        List<String> first = new ArrayList<>();
        callbackRoundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET,
                "apiBaseUrl", MOCK_BASE), first);
        assertEquals(MOCK_BASE + TOKEN_PATH, first.get(0), "第一次配置：出站用第一任 apiBaseUrl");

        List<String> second = new ArrayList<>();
        callbackRoundTrip(Map.of("stateSecret", STATE_SECRET, "jwtSecret", JWT_SECRET,
                "apiBaseUrl", "http://127.0.0.1:9391"), second);
        assertEquals("http://127.0.0.1:9391" + TOKEN_PATH, second.get(0),
                "第二次配置注入后新 apiBaseUrl 立即生效（换 token）");
        assertEquals("http://127.0.0.1:9391" + USER_PATH, second.get(1),
                "第二次配置注入后新 apiBaseUrl 立即生效（取用户信息）");
    }

    // ---------------------------------------------------------------- 契约工具（JDK only）

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
     *  只能反射注入伪造实例；POST→tokenResp，GET→userResp；uri(String) 落点捕获出站 URL）。 */
    @SuppressWarnings("unchecked")
    private WebClient fakeDingApi(List<String> captured) {
        ClassLoader cl = WebClient.class.getClassLoader();
        return (WebClient) Proxy.newProxyInstance(cl, new Class<?>[]{WebClient.class},
                (proxy, method, args) -> {
                    if ("post".equals(method.getName())) return specProxy(cl, "POST", captured);
                    if ("get".equals(method.getName())) return specProxy(cl, "GET", captured);
                    return objectOrSelf(proxy, method, args);
                });
    }

    private Object specProxy(ClassLoader cl, String route, List<String> captured) {
        Class<?> iface = "POST".equals(route)
                ? WebClient.RequestBodyUriSpec.class
                : WebClient.RequestHeadersUriSpec.class;
        return Proxy.newProxyInstance(cl, new Class<?>[]{iface}, (proxy, method, args) -> {
            if ("uri".equals(method.getName()) && args != null && args.length > 0 && args[0] instanceof String url) {
                captured.add(url);
            }
            if ("retrieve".equals(method.getName())) {
                return responseProxy(cl, route);
            }
            return objectOrSelf(proxy, method, args);
        });
    }

    private Object responseProxy(ClassLoader cl, String route) {
        return Proxy.newProxyInstance(cl, new Class<?>[]{WebClient.ResponseSpec.class},
                (proxy, method, args) -> {
                    if ("bodyToMono".equals(method.getName())) {
                        return "POST".equals(route) ? Mono.just(OK_TOKEN) : Mono.just(defaultUser());
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
