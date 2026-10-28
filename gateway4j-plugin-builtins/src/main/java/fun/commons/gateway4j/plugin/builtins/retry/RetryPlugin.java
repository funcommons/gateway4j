package fun.commons.gateway4j.plugin.builtins.retry;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;

public class RetryPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(RetryPlugin.class);

    private volatile RetryPluginConfig config;

    public RetryPlugin() {
        super(BuiltinPluginConstants.RETRY, "重试插件", "PRE", 9);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getRetryCount() <= 0) {
            return chain.execute(exchange);
        }

        String strategy = config.getStrategy() != null ? config.getStrategy().toUpperCase() : "FIXED";

        return switch (strategy) {
            case "EXPONENTIAL" -> executeWithExponentialBackoff(exchange, chain);
            case "FAILOVER" -> executeWithFailover(exchange, chain);
            default -> executeWithFixedRetry(exchange, chain);
        };
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), RetryPluginConfig.class);
    }

    private Mono<Void> executeWithFixedRetry(ServerWebExchange exchange, PluginChain chain) {
        Duration fixedDelay = config.getWaitDurationMs() != null
                ? Duration.ofMillis(config.getWaitDurationMs()) : Duration.ofMillis(100);

        return chain.execute(exchange)
                .retryWhen(Retry.fixedDelay(config.getRetryCount(), fixedDelay)
                        .filter(this::shouldRetry)
                        .doBeforeRetry(signal -> log.debug("Retry attempt {} for path {}",
                                signal.totalRetries() + 1,
                                exchange.getRequest().getPath().value()))
                        .onRetryExhaustedThrow((spec, signal) -> {
                            log.warn("Retry exhausted after {} attempts for path {}",
                                    signal.totalRetries(),
                                    exchange.getRequest().getPath().value());
                            return signal.failure();
                        }));
    }

    private Mono<Void> executeWithExponentialBackoff(ServerWebExchange exchange, PluginChain chain) {
        Duration initialDelay = config.getWaitDurationMs() != null
                ? Duration.ofMillis(config.getWaitDurationMs()) : Duration.ofMillis(100);
        double multiplier = config.getMultiplier() != null ? config.getMultiplier() : 2.0;
        Duration maxDelay = config.getMaxWaitDurationMs() != null
                ? Duration.ofMillis(config.getMaxWaitDurationMs()) : Duration.ofSeconds(10);

        return chain.execute(exchange)
                .retryWhen(Retry.backoff(config.getRetryCount(), initialDelay)
                        .maxBackoff(maxDelay)
                        .multiplier(multiplier)
                        .filter(this::shouldRetry)
                        .doBeforeRetry(signal -> log.debug("Exponential retry attempt {} for path {}",
                                signal.totalRetries() + 1,
                                exchange.getRequest().getPath().value()))
                        .onRetryExhaustedThrow((spec, signal) -> {
                            log.warn("Exponential retry exhausted after {} attempts for path {}",
                                    signal.totalRetries(),
                                    exchange.getRequest().getPath().value());
                            return signal.failure();
                        }));
    }

    private Mono<Void> executeWithFailover(ServerWebExchange exchange, PluginChain chain) {
        if (config.getFailoverUpstream() == null || config.getFailoverUpstream().isEmpty()) {
            return executeWithFixedRetry(exchange, chain);
        }

        Duration fixedDelay = config.getWaitDurationMs() != null
                ? Duration.ofMillis(config.getWaitDurationMs()) : Duration.ofMillis(100);

        return chain.execute(exchange)
                .retryWhen(Retry.fixedDelay(config.getRetryCount(), fixedDelay)
                        .filter(this::shouldRetry)
                        .doBeforeRetry(signal -> {
                            if (signal.totalRetries() >= 1) {
                                log.debug("Failover: switching to upstream {} for path {}",
                                        config.getFailoverUpstream(),
                                        exchange.getRequest().getPath().value());
                                exchange.getAttributes().put(
                                        GatewayConstants.PLUGIN_CONTEXT_PREFIX + "failover_upstream",
                                        config.getFailoverUpstream());
                            }
                        }));
    }

    private boolean shouldRetry(Throwable error) {
        if (error instanceof java.net.ConnectException) return true;
        if (error instanceof java.util.concurrent.TimeoutException) return true;
        if (error instanceof java.io.IOException) return true;

        List<Integer> retryCodes = config.getRetryStatusCodes();
        if (retryCodes != null && !retryCodes.isEmpty()) {
            String message = error.getMessage();
            if (message != null) {
                for (int code : retryCodes) {
                    if (message.contains(String.valueOf(code))) return true;
                }
            }
        }

        return false;
    }
}
