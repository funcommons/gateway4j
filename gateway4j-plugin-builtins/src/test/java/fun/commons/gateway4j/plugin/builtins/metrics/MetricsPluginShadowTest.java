package fun.commons.gateway4j.plugin.builtins.metrics;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

/**
 * S11a MetricsPlugin 影子早退 —— 契约 docs/ui-v2/实施契约.md S11 裁决细则②：
 * 影子请求（exchange 带 {@link GatewayConstants#SHADOW_KEY} attr）在
 * {@code MetricsPlugin.execute()} 直通早退，路由计数 / 时延 / 错误全部不记；
 * 非影子请求照常记（对照）。同文件内一并固化：非指标类插件不受影响（影子
 * 只豁免统计，不豁免插件链本身；LoggingPlugin 不跳过，留痕是特性）。
 *
 * <p><b>测试先行</b>：早退分支尚未实现时本文件会使 builtins 测试编译失败——
 * 预期 RED（仅缺 {@link GatewayConstants#SHADOW_KEY} 常量与早退判断）。</p>
 */
class MetricsPluginShadowTest {

    private MetricsPlugin plugin;
    private SimpleMeterRegistry meterRegistry;
    private boolean chainRan;

    @BeforeEach
    void setUp() {
        plugin = new MetricsPlugin();
        meterRegistry = new SimpleMeterRegistry();
        plugin.setMeterRegistry(meterRegistry);
        chainRan = false;
    }

    private PluginChain passThroughChain() {
        return exchange -> {
            chainRan = true;
            return Mono.empty();
        };
    }

    private MockServerWebExchange shadowExchange(String path) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get(path).build()).build();
        exchange.getAttributes().put(GatewayConstants.SHADOW_KEY, Boolean.TRUE);
        return exchange;
    }

    private void enableConfig(String pluginId) {
        plugin.onConfigChange(new PluginConfig(pluginId,
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));
    }

    @Test
    void shadowRequestIsNotCountedInRequestTotal() {
        enableConfig("metrics");

        MockServerWebExchange exchange = shadowExchange("/api/users");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(0, meterRegistry.find("gateway4j.requests.total").counters().size(),
                "影子请求不得记路由请求计数");
        assertTrue(chainRan, "早退只是跳过统计，下游插件链必须照常执行");
    }

    @Test
    void shadowPostInstanceRecordsNoLatencyAndNoErrors() {
        MetricsPlugin post = new MetricsPlugin(true);
        post.setMeterRegistry(meterRegistry);
        post.onConfigChange(new PluginConfig("metrics-post",
                "{\"enabled\":true,\"metricsPrefix\":\"gateway4j\"}", 1));

        MockServerWebExchange exchange = shadowExchange("/e2e/eng/mx/one");
        exchange.getAttributes().put("gw4j:metrics_start", System.nanoTime());
        exchange.getAttributes().put(MetricsPlugin.FORWARD_ERROR_ATTR, "AnnotatedConnectException");
        exchange.getResponse().setStatusCode(HttpStatus.BAD_GATEWAY);

        StepVerifier.create(post.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(0, meterRegistry.find("gateway4j.request.latency").timers().size(),
                "影子请求不得记时延");
        assertEquals(0, meterRegistry.find("gateway4j.requests.errors").counters().size(),
                "影子请求不得记错误计数（转发失败标记 / 5xx 同样不记）");
    }

    @Test
    void nonShadowRequestStillRecords() {
        enableConfig("metrics");

        // 同配置、不带影子 attr 的对照请求：计数照常，证明早退由影子 attr 驱动。
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/users").build()).build();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();

        assertEquals(1.0, meterRegistry.counter("gateway4j.requests.total",
                "method", "GET", "path", "/api/users").count(), 0.001);
        assertTrue(chainRan);
    }
}
