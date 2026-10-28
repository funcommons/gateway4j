package fun.commons.gateway4j.plugin.builtins.tracing;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.HexFormat;

public class TracingPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(TracingPlugin.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final boolean isPostPhase;

    public TracingPlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.TRACING_POST : BuiltinPluginConstants.TRACING,
                isPostPhase ? "跟踪插件（后置）" : "跟踪插件",
                isPostPhase ? "POST" : "PRE",
                6);
        this.isPostPhase = isPostPhase;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (!isPostPhase) {
            String existingTraceId = exchange.getRequest().getHeaders().getFirst("traceparent");
            String traceId;
            if (existingTraceId != null && !existingTraceId.isEmpty()) {
                traceId = extractTraceId(existingTraceId);
            } else {
                traceId = generateTraceId();
            }
            exchange.getAttributes().put(GatewayConstants.TRACE_ID_KEY, traceId);
            log.debug("[PRE] traceId={}", traceId);
        }
        return chain.execute(exchange);
    }

    private String generateTraceId() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private String extractTraceId(String traceparent) {
        String[] parts = traceparent.split("-");
        if (parts.length >= 2) {
            return parts[1];
        }
        return traceparent;
    }
}
