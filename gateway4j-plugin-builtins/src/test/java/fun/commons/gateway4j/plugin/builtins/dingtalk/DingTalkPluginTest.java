package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class DingTalkPluginTest {

    private DingTalkPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new DingTalkPlugin();
    }

    private PluginChain passThrough() {
        return exchange -> Mono.empty();
    }

    /** 测试侧自签 HS256 JWT（JDK Mac，与插件产物同构），密钥=入参（这里即 appSecret）。 */
    private static String testJwt(String secret) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("unionId", "u-1");
        claims.put("nick", "tester-one");
        claims.put("iss", "dingtalk");
        claims.put("exp", Instant.now().getEpochSecond() + 300);
        String head = b64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        String body = b64Url(JsonUtils.toCompactJson(claims));
        return head + "." + body + "." + hmacB64(secret, head + "." + body);
    }

    private static String b64Url(String raw) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
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

    private void setConfig(DingTalkPluginConfig cfg) {
        plugin.onConfigChange(new PluginConfig("dingtalk",
                fun.commons.gateway4j.common.util.JsonUtils.toCompactJson(cfg), 1L));
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }

    @Test
    void noTokenRedirectsToLogin() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("test-key");
        cfg.setAppSecret("test-secret");
        cfg.setLoginServer("http://gateway.example.com");
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/protected").build()).build();
        plugin.execute(exchange, passThrough()).block();

        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
        String location = exchange.getResponse().getHeaders().getFirst("Location");
        assertNotNull(location);
        assertTrue(location.contains("login.dingtalk.com/oauth2/auth"));
        assertTrue(location.contains("client_id=test-key"));
    }

    /** S11-1 修订（授权）：授权口径修订后任意 token 不再直通，载荷改为合法自签 HS256 JWT
     *  （jwtSecret 缺省回落 appSecret，故用 "s" 签发），断言注入 X-User/X-User-Nick 后放行。 */
    @Test
    void bearerTokenPassesThrough() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        setConfig(cfg);
        String jwt = testJwt("s");

        AtomicReference<ServerHttpRequest> captured = new AtomicReference<>();
        PluginChain chain = exchange -> {
            captured.set(exchange.getRequest());
            return Mono.empty();
        };
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test")
                        .header("Authorization", "Bearer " + jwt).build()).build();
        plugin.execute(exchange, chain).block();
        assertNull(exchange.getResponse().getStatusCode(), "有效 JWT 放行");
        assertEquals("u-1", captured.get().getHeaders().getFirst("X-User"));
        assertEquals("tester-one", captured.get().getHeaders().getFirst("X-User-Nick"));
    }

    @Test
    void cookieTokenPassesThrough() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        setConfig(cfg);
        String jwt = testJwt("s");

        AtomicReference<ServerHttpRequest> captured = new AtomicReference<>();
        PluginChain chain = exchange -> {
            captured.set(exchange.getRequest());
            return Mono.empty();
        };
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test")
                        .cookie(new org.springframework.http.HttpCookie("fu-gw-token", jwt))
                        .build()).build();
        plugin.execute(exchange, chain).block();
        assertNull(exchange.getResponse().getStatusCode(), "有效 JWT 放行");
        assertEquals("u-1", captured.get().getHeaders().getFirst("X-User"));
        assertEquals("tester-one", captured.get().getHeaders().getFirst("X-User-Nick"));
    }

    @Test
    void optionsRequestExcluded() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.options("/api/test").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }

    @Test
    void excludeFileExtSkipsAuth() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        cfg.setExcludeFileExt(List.of(".png", ".css"));
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/static/logo.png").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }

    @Test
    void excludePathSkipsAuth() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        cfg.setExcludePaths(List.of("/public"));
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/public/health").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }

    @Test
    void disabledPluginPassesThrough() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setEnabled(false);
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }
}
