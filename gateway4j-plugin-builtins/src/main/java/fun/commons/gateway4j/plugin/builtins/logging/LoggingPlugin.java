package fun.commons.gateway4j.plugin.builtins.logging;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

public class LoggingPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(LoggingPlugin.class);
    private static final int MAX_BODY_SIZE = 1024 * 1024;

    private final boolean isPostPhase;
    private volatile LoggingPluginConfig config;
    private volatile LogDesensitizer desensitizer;

    public LoggingPlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.LOGGING_POST : BuiltinPluginConstants.LOGGING,
                isPostPhase ? "日志插件（后置）" : "日志插件",
                isPostPhase ? "POST" : "PRE",
                5);
        this.isPostPhase = isPostPhase;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (!isPostPhase) {
            return prePhase(exchange, chain);
        }
        return postPhase(exchange, chain);
    }

    @Override
    public void onConfigChange(fun.commons.gateway4j.plugin.api.PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), LoggingPluginConfig.class);
        if (this.config != null && this.config.getDesensitizeRules() != null) {
            this.desensitizer = new LogDesensitizer(this.config.getDesensitizeRules());
        } else {
            this.desensitizer = null;
        }
    }

    private Mono<Void> prePhase(ServerWebExchange exchange, PluginChain chain) {
        exchange.getAttributes().put(GatewayConstants.REQUEST_START_TIME_KEY, System.nanoTime());

        if (config != null && config.isLogRequestBody()) {
            MediaType contentType = exchange.getRequest().getHeaders().getContentType();
            if (contentType != null && isTextBased(contentType)) {
                int maxSize = config.getMaxBodySize() > 0 ? config.getMaxBodySize() : 4096;
                return DataBufferUtils.join(exchange.getRequest().getBody(), MAX_BODY_SIZE)
                        .flatMap(dataBuffer -> {
                            byte[] bytes = new byte[dataBuffer.readableByteCount()];
                            dataBuffer.read(bytes);
                            DataBufferUtils.release(dataBuffer);
                            String body = new String(bytes, StandardCharsets.UTF_8);
                            if (body.length() > maxSize) {
                                body = body.substring(0, maxSize) + "...(truncated)";
                            }
                            body = desensitize(body);
                            log.info("[PRE] method={} path={} headers={} body={}",
                                    exchange.getRequest().getMethod(),
                                    exchange.getRequest().getPath().value(),
                                    exchange.getRequest().getHeaders().size(),
                                    body);
                            return chain.execute(exchange);
                        })
                        .switchIfEmpty(Mono.defer(() -> {
                            log.info("[PRE] method={} path={} headers={}",
                                    exchange.getRequest().getMethod(),
                                    exchange.getRequest().getPath().value(),
                                    exchange.getRequest().getHeaders().size());
                            return chain.execute(exchange);
                        }));
            }
        }

        log.info("[PRE] method={} path={} headers={}",
                exchange.getRequest().getMethod(),
                exchange.getRequest().getPath().value(),
                exchange.getRequest().getHeaders().size());
        return chain.execute(exchange);
    }

    private Mono<Void> postPhase(ServerWebExchange exchange, PluginChain chain) {
        Long startTime = exchange.getAttribute(GatewayConstants.REQUEST_START_TIME_KEY);
        long durationMs = startTime != null ? (System.nanoTime() - startTime) / 1_000_000 : -1;

        if (config != null && config.isLogResponseBody()) {
            int maxSize = config.getMaxBodySize() > 0 ? config.getMaxBodySize() : 4096;
            return chain.execute(exchange).then(Mono.defer(() -> {
                String bodyLog = "";
                Object cachedBody = exchange.getAttribute(GatewayConstants.PLUGIN_CONTEXT_PREFIX + "response_body");
                if (cachedBody instanceof String body) {
                    if (body.length() > maxSize) {
                        body = body.substring(0, maxSize) + "...(truncated)";
                    }
                    bodyLog = desensitize(body);
                }
                log.info("[POST] status={} duration={}ms path={} body={}",
                        exchange.getResponse().getStatusCode(),
                        durationMs,
                        exchange.getRequest().getPath().value(),
                        bodyLog);
                return Mono.empty();
            }));
        }

        log.info("[POST] status={} duration={}ms path={}",
                exchange.getResponse().getStatusCode(),
                durationMs,
                exchange.getRequest().getPath().value());
        return chain.execute(exchange);
    }

    private String desensitize(String text) {
        if (desensitizer != null) return desensitizer.desensitize(text);
        return text;
    }

    private boolean isTextBased(MediaType contentType) {
        return contentType.isCompatibleWith(MediaType.APPLICATION_JSON)
                || contentType.isCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED)
                || contentType.isCompatibleWith(MediaType.TEXT_XML)
                || contentType.isCompatibleWith(MediaType.TEXT_PLAIN);
    }
}
