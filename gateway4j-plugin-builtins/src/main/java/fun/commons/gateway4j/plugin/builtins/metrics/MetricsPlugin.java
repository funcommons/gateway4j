package fun.commons.gateway4j.plugin.builtins.metrics;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;

public class MetricsPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(MetricsPlugin.class);
    private static final String START_TIME_ATTR = GatewayConstants.PLUGIN_CONTEXT_PREFIX + "metrics_start";

    /**
     * Set by the engine (PluginExecutionFilter) — the serving route's configured
     * path pattern (e.g. {@code /api/user/**}). Metric {@code path} tags prefer it
     * over the concrete request path: /v1/monitor/routes/status indexes meters by
     * the route's configured path, and per-pattern aggregation avoids unbounded
     * path-tag cardinality. Keep the literal in sync with the engine constant
     * ("gw4j:routePathPattern"); plugin-api cannot carry the shared key.
     */
    public static final String ROUTE_PATH_PATTERN_ATTR = "gw4j:routePathPattern";

    /**
     * Set by the engine (PluginExecutionFilter) on the POST chain's error path —
     * the simple name of the exception that failed the forward (e.g.
     * {@code AnnotatedConnectException}). The POST-phase instance counts it as a
     * request error even though the response status is not yet rendered. Keep the
     * literal in sync with the engine constant ("gw4j:forwardError").
     */
    public static final String FORWARD_ERROR_ATTR = "gw4j:forwardError";

    private final boolean postPhase;
    private volatile MetricsPluginConfig config;
    private volatile MeterRegistry meterRegistry;

    public MetricsPlugin() {
        this(false);
    }

    /**
     * @param postPhase false → PRE instance ({@code metrics}, counts requests before
     *                  the forward); true → POST instance ({@code metrics-post},
     *                  records latency/final status and errors after the response
     *                  phase — the only vantage point that sees real response
     *                  statuses and the engine's forward-error marker).
     */
    public MetricsPlugin(boolean postPhase) {
        super(postPhase ? BuiltinPluginConstants.METRICS_POST : BuiltinPluginConstants.METRICS,
                postPhase ? "指标采集插件（后置）" : "指标采集插件",
                postPhase ? "POST" : "PRE", 0);
        this.postPhase = postPhase;
    }

    public void setMeterRegistry(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        // S11a 影子请求早退（契约细则②）：admin 调试回放（X-Gw4j-Shadow 口令匹配，
        // 引擎置 gw4j:shadow attr）直通下游插件链，路由计数/时延/错误全部不记；
        // 早退只是跳过统计，LoggingPlugin 等其余插件照常执行（留痕是特性）。
        if (exchange.getAttribute(GatewayConstants.SHADOW_KEY) != null) {
            return chain.execute(exchange);
        }
        if (config == null || !config.isEnabled() || meterRegistry == null) {
            return chain.execute(exchange);
        }

        String prefix = config.getMetricsPrefix() != null ? config.getMetricsPrefix() : "gateway4j";

        if (!postPhase) {
            if (config.isLogRequestCount()) {
                Counter.builder(prefix + ".requests.total")
                        .description("Total requests")
                        .tag("method", exchange.getRequest().getMethod().name())
                        .tag("path", metricPath(exchange))
                        .register(meterRegistry)
                        .increment();
            }
            exchange.getAttributes().put(START_TIME_ATTR, System.nanoTime());
        } else if (exchange.getAttribute(START_TIME_ATTR) == null) {
            // No PRE instance ran (metrics row absent): still record duration from the
            // engine-wide request start so latency/errors are not lost.
            Object engineStart = exchange.getAttribute(GatewayConstants.REQUEST_START_TIME_KEY);
            exchange.getAttributes().put(START_TIME_ATTR, engineStart != null ? engineStart : System.nanoTime());
        }

        return chain.execute(exchange).doOnSuccess(v -> recordLatency(exchange, prefix, null))
                .doOnError(err -> recordLatency(exchange, prefix, err));
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        MetricsPluginConfig newConfig = null;
        try {
            newConfig = JsonUtils.parseObject(pluginConfig.config(), MetricsPluginConfig.class);
        } catch (Exception e) {
            log.warn("Failed to parse metrics plugin config (using defaults): {}", e.getMessage());
        }
        // null/blank config → defaults (enabled, prefix gateway4j, all counters on),
        // so a plain ENABLED gw_plugin row without config JSON already lights up the monitor dashboard.
        this.config = newConfig != null ? newConfig : new MetricsPluginConfig();
    }

    private void recordLatency(ServerWebExchange exchange, String prefix, Throwable error) {
        Long startTime = exchange.getAttribute(START_TIME_ATTR);
        if (startTime == null) return;

        long durationNanos = System.nanoTime() - startTime;
        String path = metricPath(exchange);
        String method = exchange.getRequest().getMethod().name();

        HttpStatus status = exchange.getResponse().getStatusCode() instanceof HttpStatus hs ? hs : null;
        String statusCode = status != null ? String.valueOf(status.value()) : "unknown";

        // Only the POST instance records latency/errors: it runs after the response
        // phase and sees the real status. The PRE instance completes BEFORE the
        // forward — its samples would be near-zero-duration with status "unknown"
        // and would skew every aggregate (avg/p95) read by the monitor dashboard.
        if (!postPhase) {
            return;
        }

        if (config.isLogLatency()) {
            Timer.builder(prefix + ".request.latency")
                    .description("Request latency")
                    .publishPercentiles(0.5, 0.95, 0.99)
                    .tag("method", method)
                    .tag("path", path)
                    .tag("status", statusCode)
                    .register(meterRegistry)
                    .record(Duration.ofNanos(durationNanos));
        }

        boolean forwardFailed = exchange.getAttribute(FORWARD_ERROR_ATTR) != null;
        if (config.isLogErrorCount() && (error != null || forwardFailed
                || (status != null && status.is5xxServerError()))) {
            Counter.builder(prefix + ".requests.errors")
                    .description("Request errors")
                    .tag("method", method)
                    .tag("path", path)
                    .tag("status", forwardFailed && status == null ? "502" : statusCode)
                    .register(meterRegistry)
                    .increment();
        }
    }

    /**
     * Metric {@code path} tag: the serving route's configured path pattern when
     * the engine exposed one (preferred — matches the monitor dashboard's route
     * indexing), else the normalized concrete request path.
     */
    private String metricPath(ServerWebExchange exchange) {
        Object pattern = exchange.getAttribute(ROUTE_PATH_PATTERN_ATTR);
        return normalizePath(pattern instanceof String p && !p.isBlank() ? p : exchange.getRequest().getPath().value());
    }

    private String normalizePath(String path) {
        if (path == null) return "unknown";
        String normalized = path.replaceAll("/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/{id}");
        normalized = normalized.replaceAll("/\\d+", "/{id}");
        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
        }
        return normalized;
    }
}
