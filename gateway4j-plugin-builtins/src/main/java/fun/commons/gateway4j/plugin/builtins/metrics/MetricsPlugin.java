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

    private volatile MetricsPluginConfig config;
    private volatile MeterRegistry meterRegistry;

    public MetricsPlugin() {
        super(BuiltinPluginConstants.METRICS, "指标采集插件", "PRE", 0);
    }

    public void setMeterRegistry(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || !config.isEnabled() || meterRegistry == null) {
            return chain.execute(exchange);
        }

        String prefix = config.getMetricsPrefix() != null ? config.getMetricsPrefix() : "gateway4j";

        if (config.isLogRequestCount()) {
            Counter.builder(prefix + ".requests.total")
                    .description("Total requests")
                    .tag("method", exchange.getRequest().getMethod().name())
                    .tag("path", normalizePath(exchange.getRequest().getPath().value()))
                    .register(meterRegistry)
                    .increment();
        }

        exchange.getAttributes().put(START_TIME_ATTR, System.nanoTime());

        return chain.execute(exchange).doOnSuccess(v -> recordLatency(exchange, prefix, null))
                .doOnError(err -> recordLatency(exchange, prefix, err));
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), MetricsPluginConfig.class);
    }

    private void recordLatency(ServerWebExchange exchange, String prefix, Throwable error) {
        Long startTime = exchange.getAttribute(START_TIME_ATTR);
        if (startTime == null) return;

        long durationNanos = System.nanoTime() - startTime;
        String path = normalizePath(exchange.getRequest().getPath().value());
        String method = exchange.getRequest().getMethod().name();

        HttpStatus status = exchange.getResponse().getStatusCode() instanceof HttpStatus hs ? hs : null;
        String statusCode = status != null ? String.valueOf(status.value()) : "unknown";

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

        if (config.isLogErrorCount() && (error != null || (status != null && status.is5xxServerError()))) {
            Counter.builder(prefix + ".requests.errors")
                    .description("Request errors")
                    .tag("method", method)
                    .tag("path", path)
                    .tag("status", statusCode)
                    .register(meterRegistry)
                    .increment();
        }
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
