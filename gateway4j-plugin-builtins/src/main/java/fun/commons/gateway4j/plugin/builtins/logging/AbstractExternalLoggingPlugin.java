package fun.commons.gateway4j.plugin.builtins.logging;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ThreadLocalRandom;

public abstract class AbstractExternalLoggingPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(AbstractExternalLoggingPlugin.class);

    private final boolean isPostPhase;

    protected AbstractExternalLoggingPlugin(String pluginId, String pluginName, String phase, int order, boolean isPostPhase) {
        super(pluginId, pluginName, phase, order);
        this.isPostPhase = isPostPhase;
    }

    protected abstract ExternalLogConfig getLogConfig();

    protected abstract void collectLog(Map<String, Object> logData);

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        ExternalLogConfig config = getLogConfig();
        if (config == null || !config.isEnabled()) {
            return chain.execute(exchange);
        }

        // Sampling check
        Double sampleRate = config.getSampleRate();
        if (sampleRate != null && sampleRate < 1.0 && sampleRate > 0) {
            if (ThreadLocalRandom.current().nextDouble() >= sampleRate) {
                return chain.execute(exchange);
            }
        }

        if (!isPostPhase) {
            exchange.getAttributes().put(GatewayConstants.REQUEST_START_TIME_KEY, System.nanoTime());
            return chain.execute(exchange);
        }

        // POST phase
        Long startTime = exchange.getAttribute(GatewayConstants.REQUEST_START_TIME_KEY);
        long durationMs = startTime != null ? (System.nanoTime() - startTime) / 1_000_000 : -1;

        Map<String, Object> logData = buildLogData(exchange, durationMs);
        try {
            collectLog(logData);
        } catch (Exception e) {
            log.warn("Failed to collect external log: {}", e.getMessage());
        }

        return chain.execute(exchange);
    }

    private Map<String, Object> buildLogData(ServerWebExchange exchange, long durationMs) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("timestamp", Instant.now().toString());
        data.put("method", exchange.getRequest().getMethod().name());
        data.put("path", exchange.getRequest().getPath().value());
        data.put("query", Objects.toString(exchange.getRequest().getURI().getRawQuery(), ""));
        data.put("clientIp", resolveClientIp(exchange));
        data.put("userAgent", exchange.getRequest().getHeaders().getFirst("User-Agent"));
        data.put("host", exchange.getRequest().getHeaders().getFirst("Host"));
        data.put("status", exchange.getResponse().getStatusCode() != null
                ? exchange.getResponse().getStatusCode().value() : null);
        data.put("durationMs", durationMs);
        data.put("traceId", exchange.getAttribute(GatewayConstants.TRACE_ID_KEY));
        data.put("routeId", exchange.getAttribute(GatewayConstants.ROUTE_ID_KEY));
        return data;
    }

    private String resolveClientIp(ServerWebExchange exchange) {
        String ip = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (ip != null && !ip.isEmpty()) {
            return ip.split(",")[0].trim();
        }
        ip = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
        if (ip != null && !ip.isEmpty()) {
            return ip.trim();
        }
        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        return remoteAddress != null ? remoteAddress.getAddress().getHostAddress() : "unknown";
    }
}
