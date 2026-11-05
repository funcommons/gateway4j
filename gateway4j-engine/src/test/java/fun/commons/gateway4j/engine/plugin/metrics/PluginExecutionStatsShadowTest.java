package fun.commons.gateway4j.engine.plugin.metrics;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;

import static org.junit.jupiter.api.Assertions.*;

/**
 * S11a 插件级执行统计的影子守卫 —— 契约 docs/ui-v2/实施契约.md S11 裁决细则②：
 * 影子请求（exchange 带 {@link GatewayConstants#SHADOW_KEY} attr）的插件级
 * 统计不记（Micrometer meter 与 Redis runtime catalog 的 stats 对象都不受
 * 调试流量污染）；非影子请求照常记。
 *
 * <p><b>测试先行</b>：守卫重载尚未实现时本文件会使 engine 测试编译失败——预期
 * RED。契约固定的守卫签名（在既有 4 参 {@code record} 之上追加；exchange 带
 * 影子 attr 时不记数，否则等价委托既有 {@code record}）：</p>
 * <pre>
 * public void record(ServerWebExchange exchange, String pluginId,
 *                    String pluginName, String phase, Result result)
 * </pre>
 */
class PluginExecutionStatsShadowTest {

    private static ServerWebExchange exchangeWithShadow(boolean shadow) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/x").build()).build();
        if (shadow) {
            exchange.getAttributes().put(GatewayConstants.SHADOW_KEY, Boolean.TRUE);
        }
        return exchange;
    }

    @Test
    void shadowExchangeRecordIsIgnored() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PluginExecutionStats stats = new PluginExecutionStats(registry);

        stats.record(exchangeWithShadow(true), "security", "安全插件", "PRE",
                PluginExecutionStats.Result.OK);
        stats.record(exchangeWithShadow(true), "security", "安全插件", "PRE",
                PluginExecutionStats.Result.ERROR);

        assertArrayEquals(new long[]{0, 0, 0}, stats.statsFor("security"),
                "影子请求不得进入插件级执行统计");
        assertTrue(stats.snapshot().isEmpty(), "snapshot 中也不得出现影子请求的插件条目");
        assertEquals(0, registry.find(PluginExecutionStats.METER_NAME).counters().size(),
                "Micrometer meter 不得为影子请求增加");
    }

    @Test
    void plainExchangeRecordStillCounts() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PluginExecutionStats stats = new PluginExecutionStats(registry);

        stats.record(exchangeWithShadow(false), "security", "安全插件", "PRE",
                PluginExecutionStats.Result.OK);

        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("security"),
                "非影子请求照常记插件级统计");
        assertEquals(1d, registry.get(PluginExecutionStats.METER_NAME)
                .tag("plugin_id", "security").tag("result", "ok").counter().count());
    }

    @Test
    void legacyRecordSignatureUnaffected() {
        // 既有 4 参 record（无 exchange 上下文的调用点）行为保持不变。
        PluginExecutionStats stats = new PluginExecutionStats();
        stats.record("p", "p", "PRE", PluginExecutionStats.Result.OK);
        stats.record(null, null, null, PluginExecutionStats.Result.ERROR);
        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("p"));
        assertArrayEquals(new long[]{0, 0, 1}, stats.statsFor("unknown"));
    }
}
