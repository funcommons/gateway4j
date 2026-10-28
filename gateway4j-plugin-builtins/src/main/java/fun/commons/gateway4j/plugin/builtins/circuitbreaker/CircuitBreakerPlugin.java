package fun.commons.gateway4j.plugin.builtins.circuitbreaker;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;
import io.github.resilience4j.reactor.circuitbreaker.operator.CircuitBreakerOperator;
import io.github.resilience4j.reactor.ratelimiter.operator.RateLimiterOperator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class CircuitBreakerPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(CircuitBreakerPlugin.class);

    private volatile CircuitBreakerPluginConfig config;
    private final ConcurrentMap<String, CircuitBreaker> circuitBreakers = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, RateLimiter> rateLimiters = new ConcurrentHashMap<>();

    public CircuitBreakerPlugin() {
        super(BuiltinPluginConstants.CIRCUIT_BREAKER, "熔断器插件", "PRE", 10);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String routeId = exchange.getAttribute(GatewayConstants.ROUTE_ID_KEY);
        String instanceId = routeId != null ? routeId : "default";

        if (Boolean.TRUE.equals(config.getCircuitEnable())) {
            return combined(exchange, chain, instanceId);
        }
        return rateLimiterOnly(exchange, chain, instanceId);
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        CircuitBreakerPluginConfig newConfig = JsonUtils.parseObject(pluginConfig.config(), CircuitBreakerPluginConfig.class);

        // Clean up old instances
        circuitBreakers.values().forEach(CircuitBreaker::reset);
        circuitBreakers.clear();
        rateLimiters.clear();

        this.config = newConfig;
    }

    @Override
    public void onDestroy() {
        circuitBreakers.values().forEach(CircuitBreaker::reset);
        circuitBreakers.clear();
        rateLimiters.clear();
    }

    void forceCircuitOpenForTest() {
        circuitBreakers.values().forEach(cb -> cb.transitionToOpenState());
    }

    private CircuitBreaker getOrCreateCircuitBreaker(String instanceId) {
        return circuitBreakers.computeIfAbsent(instanceId, id -> {
            CircuitBreakerConfig cbConfig = CircuitBreakerConfig.custom()
                    .failureRateThreshold(config.getFailureRateThreshold() != null ? config.getFailureRateThreshold() : 50)
                    .waitDurationInOpenState(Duration.ofMillis(config.getWaitDurationMs() != null ? config.getWaitDurationMs() : 60000))
                    .permittedNumberOfCallsInHalfOpenState(config.getPermittedCallsInHalfOpen() != null ? config.getPermittedCallsInHalfOpen() : 10)
                    .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                    .slidingWindowSize(config.getSlidingWindowSize() != null ? config.getSlidingWindowSize() : 100)
                    .minimumNumberOfCalls(config.getMinimumNumberOfCalls() != null ? config.getMinimumNumberOfCalls() : 10)
                    .build();
            return CircuitBreakerRegistry.of(cbConfig).circuitBreaker("cb-" + id, cbConfig);
        });
    }

    private RateLimiter getOrCreateRateLimiter(String instanceId) {
        return rateLimiters.computeIfAbsent(instanceId, id -> {
            RateLimiterConfig rlConfig = RateLimiterConfig.custom()
                    .limitForPeriod(config.getLimitForPeriod() != null ? config.getLimitForPeriod() : 100)
                    .limitRefreshPeriod(Duration.ofMillis(config.getLimitRefreshPeriodMs() != null ? config.getLimitRefreshPeriodMs() : 1000))
                    .timeoutDuration(Duration.ofMillis(config.getTimeoutDurationMs() != null ? config.getTimeoutDurationMs() : 5000))
                    .build();
            return RateLimiterRegistry.of(rlConfig).rateLimiter("rl-" + id, rlConfig);
        });
    }

    private Mono<Void> combined(ServerWebExchange exchange, PluginChain chain, String instanceId) {
        Mono<Void> result = chain.execute(exchange);

        // Rate limiter first so rate-limited requests don't pollute CB metrics
        RateLimiter rl = config.getLimitForPeriod() != null && config.getLimitForPeriod() > 0
                ? getOrCreateRateLimiter(instanceId) : null;
        if (rl != null) {
            result = result.transformDeferred(RateLimiterOperator.of(rl));
        }

        CircuitBreaker cb = getOrCreateCircuitBreaker(instanceId);
        result = result.transformDeferred(CircuitBreakerOperator.of(cb));

        return result.onErrorResume(CallNotPermittedException.class, e -> {
            log.warn("Circuit breaker open for {}, rejecting request", instanceId);
            exchange.getResponse().setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            return exchange.getResponse().setComplete();
        }).onErrorResume(RequestNotPermitted.class, e -> {
            log.warn("Rate limit exceeded for {}", instanceId);
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            return exchange.getResponse().setComplete();
        });
    }

    private Mono<Void> rateLimiterOnly(ServerWebExchange exchange, PluginChain chain, String instanceId) {
        if (config.getLimitForPeriod() == null || config.getLimitForPeriod() <= 0) {
            return chain.execute(exchange);
        }

        RateLimiter rl = getOrCreateRateLimiter(instanceId);
        return chain.execute(exchange)
                .transformDeferred(RateLimiterOperator.of(rl))
                .onErrorResume(RequestNotPermitted.class, e -> {
                    log.warn("Rate limit exceeded for {}", instanceId);
                    exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                    return exchange.getResponse().setComplete();
                });
    }
}
