package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

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

    @Test
    void bearerTokenPassesThrough() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test")
                        .header("Authorization", "Bearer valid-token").build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
    }

    @Test
    void cookieTokenPassesThrough() {
        DingTalkPluginConfig cfg = new DingTalkPluginConfig();
        cfg.setAppKey("k");
        cfg.setAppSecret("s");
        setConfig(cfg);

        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/test")
                        .cookie(new org.springframework.http.HttpCookie("fu-gw-token", "tok123"))
                        .build()).build();
        plugin.execute(exchange, passThrough()).block();
        assertNull(exchange.getResponse().getStatusCode());
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
