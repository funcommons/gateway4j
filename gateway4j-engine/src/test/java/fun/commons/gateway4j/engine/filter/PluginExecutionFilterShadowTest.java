package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.metrics.InFlightRequestTracker;
import fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/**
 * S11a 影子请求在引擎入口（PluginExecutionFilter）的行为 —— 契约
 * docs/ui-v2/实施契约.md S11 裁决细则①：admin 调试回放以
 * {@code X-Gw4j-Shadow: <gateway4j.debug.shadow-token>} 头标记影子请求。
 *
 * <p><b>测试先行</b>：影子行为尚未实现时本文件会使 engine 测试编译失败——预期
 * RED。契约固定的构造签名（在既有 2 参/4 参之上追加，4 参委托本构造并传
 * {@code null} 口令，即影子功能关闭）：</p>
 * <pre>
 * public PluginExecutionFilter(ConfigService configService,
 *                              PluginInstanceRegistry pluginRegistry,
 *                              InFlightRequestTracker inFlightTracker,
 *                              PluginExecutionStats executionStats,
 *                              String shadowToken)   // gateway4j.debug.shadow-token
 * </pre>
 *
 * <p><b>裁决语义</b>：</p>
 * <ul>
 *   <li>口令匹配（配置口令非空且请求头值相等）→ 影子请求：入口不增 in-flight
 *       gauge（doFinally 复原路径保持不变，对未增计数是安全空操作），置
 *       {@link GatewayConstants#SHADOW_KEY} exchange attr 供下游读；</li>
 *   <li>缺头 / 口令不匹配 / 配置口令为空 → 一律视为非影子，照常计数（防公网
 *       伪造头逃逸统计）；</li>
 *   <li>影子请求的插件链照跑（PRE → 转发 → POST），但插件级统计
 *       （{@link PluginExecutionStats}）不记 —— 含链上 ok 与编排期 skipped。</li>
 * </ul>
 */
class PluginExecutionFilterShadowTest {

    private static final String SHADOW_TOKEN = "local-debug-shadow";

    private List<String> execution;
    private List<Route> routes;
    private List<Plugin> plugins;
    private List<RoutePluginBinding> bindings;
    private PluginInstanceRegistry registry;
    private ConfigService configService;

    @BeforeEach
    void setUp() {
        execution = new ArrayList<>();
        routes = new ArrayList<>();
        plugins = new ArrayList<>();
        bindings = new ArrayList<>();
        registry = new PluginInstanceRegistry();
        register("gpre", "PRE", "GLOBAL");
        register("gpost", "POST", "GLOBAL");
        register("rpre", "PRE", "ROUTE");
        RouteDispatcher dispatcher = new RouteDispatcher(new RoutePathMatcher(), new RouteConditionMatcher());
        configService = new ConfigService(new RouteConfigCache(), new PluginConfigCache(),
                dispatcher, event -> {}, () -> routes, () -> List.of(), () -> plugins,
                () -> bindings, registry);
    }

    private void register(String pluginId, String phase, String scope) {
        registry.register(new fun.commons.gateway4j.plugin.api.GatewayPlugin() {
            @Override public String pluginId() { return pluginId; }
            @Override public String pluginName() { return pluginId; }
            @Override public String phase() { return phase; }
            @Override public int order() { return 0; }
            @Override public Mono<Void> execute(org.springframework.web.server.ServerWebExchange exchange,
                                                fun.commons.gateway4j.plugin.api.PluginChain chain) {
                execution.add(pluginId + ":" + phase);
                return chain.execute(exchange);
            }
        });
    }

    private void seed() {
        plugins.add(Plugin.builder().id(1L).pluginId("gpre").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(5).config("{}").build());
        plugins.add(Plugin.builder().id(2L).pluginId("gpost").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("POST").scope("GLOBAL")
                .status("ENABLED").sortOrder(5).config("{}").build());
        plugins.add(Plugin.builder().id(3L).pluginId("rpre").pluginName("r")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("ROUTE")
                .status("ENABLED").sortOrder(1).config("{}").build());
        bindings.add(RoutePluginBinding.builder().routeId(7L).pluginId(3L).sortOrder(1).build());
        routes.add(Route.builder().id(7L).routeName("r7").routeType("BACKEND")
                .path("/api/**").upstreamUrl("http://127.0.0.1:1").status("PUBLISHED").build());
        configService.loadAllConfig();
    }

    /** shadowHeaderValue 为 null 时不带影子头。 */
    private MockServerWebExchange exchange(String shadowHeaderValue) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get("/api/x");
        if (shadowHeaderValue != null) {
            builder.header(GatewayConstants.SHADOW_HEADER, shadowHeaderValue);
        }
        MockServerWebExchange exchange = MockServerWebExchange.builder(builder.build()).build();
        exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR,
                org.springframework.cloud.gateway.route.Route.async().id("7")
                        .uri(URI.create("http://127.0.0.1:1"))
                        .asyncPredicate(e -> Mono.just(true)).build());
        return exchange;
    }

    private PluginExecutionFilter filterWith(InFlightRequestTracker tracker, PluginExecutionStats stats,
                                             String shadowToken) {
        return new PluginExecutionFilter(configService, registry, tracker, stats, shadowToken);
    }

    // ==================== 口令匹配：不增 gauge、置 attr、链照跑 ====================

    @Test
    void shadowRequestSkipsInFlightGaugeButStillRunsChain() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        PluginExecutionFilter filter = filterWith(tracker, null, SHADOW_TOKEN);
        seed();

        AtomicLong seenDuringRequest = new AtomicLong(-1);
        List<String> order = new ArrayList<>();
        filter.filter(exchange(SHADOW_TOKEN), ex -> {
            order.add("forward");
            seenDuringRequest.set(tracker.activeFor("/api/**"));
            return Mono.empty();
        }).block();

        assertEquals(0L, seenDuringRequest.get(),
                "影子请求在请求执行期间也不得计入 in-flight gauge");
        assertEquals(0L, tracker.activeFor("/api/**"),
                "请求结束后 gauge 必须仍为 0（入口未增计数，doFinally 复原是空操作）");
        assertTrue(execution.contains("gpre:PRE") && execution.contains("gpost:POST"),
                "影子请求的插件链必须照常执行（LoggingPlugin 留痕是特性）");
        assertEquals(List.of("forward"), order, "影子请求照常转发");
    }

    /** 影子标记 attr：口令匹配时在 filter 运行后可从 exchange 读到（非 null 即影子）。 */
    @Test
    void shadowRequestSetsShadowAttributeForDownstream() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        PluginExecutionFilter filter = filterWith(tracker, null, SHADOW_TOKEN);
        seed();

        MockServerWebExchange exchange = exchange(SHADOW_TOKEN);
        filter.filter(exchange, ex -> Mono.empty()).block();

        assertNotNull(exchange.getAttribute(GatewayConstants.SHADOW_KEY),
                "口令匹配必须置 GatewayConstants.SHADOW_KEY attr 供 MetricsPlugin/统计守卫读取");
    }

    // ==================== 口令不匹配 / 缺头 / 配置空：照常计数 ====================

    @Test
    void wrongShadowTokenIsCountedAsNormalTraffic() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        PluginExecutionFilter filter = filterWith(tracker, null, SHADOW_TOKEN);
        seed();

        AtomicLong seenDuringRequest = new AtomicLong(-1);
        MockServerWebExchange exchange = exchange("forged-token");
        filter.filter(exchange, ex -> {
            seenDuringRequest.set(tracker.activeFor("/api/**"));
            return Mono.empty();
        }).block();

        assertEquals(1L, seenDuringRequest.get(), "口令不匹配 → 非影子，照常计数（防伪造头逃逸统计）");
        assertEquals(0L, tracker.activeFor("/api/**"));
        assertNull(exchange.getAttribute(GatewayConstants.SHADOW_KEY),
                "口令不匹配不得置影子 attr");
    }

    @Test
    void missingShadowHeaderIsCountedAsNormalTraffic() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        PluginExecutionFilter filter = filterWith(tracker, null, SHADOW_TOKEN);
        seed();

        AtomicLong seenDuringRequest = new AtomicLong(-1);
        MockServerWebExchange exchange = exchange(null);
        filter.filter(exchange, ex -> {
            seenDuringRequest.set(tracker.activeFor("/api/**"));
            return Mono.empty();
        }).block();

        assertEquals(1L, seenDuringRequest.get(), "缺影子头 → 普通流量，照常计数");
        assertNull(exchange.getAttribute(GatewayConstants.SHADOW_KEY));
    }

    @Test
    void blankConfiguredTokenDisablesShadowRecognition() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        // 配置口令为空（未配置 gateway4j.debug.shadow-token）→ 任何头都不构成影子
        PluginExecutionFilter filter = filterWith(tracker, null, "");
        seed();

        AtomicLong seenDuringRequest = new AtomicLong(-1);
        MockServerWebExchange exchange = exchange("local-debug-shadow");
        filter.filter(exchange, ex -> {
            seenDuringRequest.set(tracker.activeFor("/api/**"));
            return Mono.empty();
        }).block();

        assertEquals(1L, seenDuringRequest.get(),
                "配置口令为空时请求头再正确也视为非影子（空/不匹配=非影子，契约细则①）");
        assertNull(exchange.getAttribute(GatewayConstants.SHADOW_KEY));
    }

    // ==================== 插件级统计守卫（经链路端到端） ====================

    @Test
    void shadowRequestRecordsNoPluginExecutionStats() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        PluginExecutionStats stats = new PluginExecutionStats();
        PluginExecutionFilter filter = filterWith(tracker, stats, SHADOW_TOKEN);

        register("gpre", "PRE", "GLOBAL");
        plugins.add(Plugin.builder().id(1L).pluginId("gpre").pluginName("g")
                .pluginType("BUILTIN").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(1).config("{}").build());
        // 无运行实例的行：编排期记 skipped —— 影子请求同样不得记
        plugins.add(Plugin.builder().id(4L).pluginId("ghost").pluginName("ghost-name")
                .pluginType("GROOVY").pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(2).config("{}").build());
        seed();
        configService.loadAllConfig();

        filter.filter(exchange(SHADOW_TOKEN), ex -> Mono.empty()).block();
        assertArrayEquals(new long[]{0, 0, 0}, stats.statsFor("gpre"),
                "影子请求不得记插件执行统计（ok）");
        assertArrayEquals(new long[]{0, 0, 0}, stats.statsFor("ghost"),
                "影子请求不得记插件执行统计（skipped）");

        // 对照：非影子请求照常记
        filter.filter(exchange(null), ex -> Mono.empty()).block();
        assertArrayEquals(new long[]{1, 0, 0}, stats.statsFor("gpre"));
        assertArrayEquals(new long[]{0, 1, 0}, stats.statsFor("ghost"));
    }
}
