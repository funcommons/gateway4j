package fun.commons.gateway4j.plugin.builtins.ratelimit;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class RateLimitPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(RateLimitPlugin.class);

    private static final String LUA_SCRIPT = """
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local period = tonumber(ARGV[2])
            local current = tonumber(redis.call('get', key) or '0')
            if current >= limit then
                return 0
            end
            redis.call('incr', key)
            if current == 0 then
                redis.call('pexpire', key, period)
            end
            return 1
            """;

    private volatile RateLimitPluginConfig config;
    private final Map<String, TokenBucket> buckets = new ConcurrentHashMap<>();
    private volatile StringRedisTemplate redisTemplate;

    public RateLimitPlugin() {
        super(BuiltinPluginConstants.RATE_LIMITER, "限流插件", "PRE", 3);
    }

    public void setRedisTemplate(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getLimit() <= 0) {
            return chain.execute(exchange);
        }

        String key = resolveKey(exchange);

        if (config.getMode() != null && "DISTRIBUTED".equals(config.getMode()) && redisTemplate != null) {
            return distributedLimit(exchange, chain, key);
        }

        return localLimit(exchange, chain, key);
    }

    private Mono<Void> localLimit(ServerWebExchange exchange, PluginChain chain, String key) {
        long periodMs = config.getPeriodMs() != null ? config.getPeriodMs() : 1000;
        TokenBucket bucket = buckets.computeIfAbsent(key,
                k -> new TokenBucket(config.getLimit(), periodMs));

        if (!bucket.tryAcquire()) {
            log.warn("Rate limit exceeded for key: {}", key);
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            return exchange.getResponse().setComplete();
        }

        return chain.execute(exchange);
    }

    private Mono<Void> distributedLimit(ServerWebExchange exchange, PluginChain chain, String key) {
        String redisKey = "gateway4j:ratelimit:" + key;
        long periodMs = config.getPeriodMs() != null ? config.getPeriodMs() : 1000;

        DefaultRedisScript<Long> script = new DefaultRedisScript<>(LUA_SCRIPT, Long.class);
        Long result = redisTemplate.execute(script,
                Collections.singletonList(redisKey),
                String.valueOf(config.getLimit()),
                String.valueOf(periodMs));

        if (result == null || result == 0) {
            log.warn("Distributed rate limit exceeded for key: {}", key);
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            return exchange.getResponse().setComplete();
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), RateLimitPluginConfig.class);
        this.buckets.clear();
    }

    @Override
    public void onDestroy() {
        this.buckets.clear();
    }

    private String resolveKey(ServerWebExchange exchange) {
        if (config == null || config.getDimension() == null) {
            return "global";
        }
        return switch (config.getDimension()) {
            case "IP" -> resolveClientIp(exchange);
            case "ROUTE" -> exchange.getRequest().getPath().value();
            default -> "global";
        };
    }

    private String resolveClientIp(ServerWebExchange exchange) {
        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        return remoteAddress != null ? remoteAddress.getAddress().getHostAddress() : "unknown";
    }

    static class TokenBucket {
        private final int maxTokens;
        private final long periodMs;
        private final AtomicLong available;
        private volatile long lastRefillTime;

        TokenBucket(int maxTokens, long periodMs) {
            this.maxTokens = maxTokens;
            this.periodMs = periodMs;
            this.available = new AtomicLong(maxTokens);
            this.lastRefillTime = System.currentTimeMillis();
        }

        boolean tryAcquire() {
            refill();
            while (true) {
                long current = available.get();
                if (current <= 0) {
                    return false;
                }
                if (available.compareAndSet(current, current - 1)) {
                    return true;
                }
            }
        }

        private void refill() {
            long now = System.currentTimeMillis();
            long elapsed = now - lastRefillTime;
            if (elapsed >= periodMs) {
                long periodsElapsed = elapsed / periodMs;
                long tokensToAdd = periodsElapsed * maxTokens;
                long current = available.get();
                long newTokens = Math.min(maxTokens, current + tokensToAdd);
                if (available.compareAndSet(current, newTokens)) {
                    lastRefillTime = now;
                }
            }
        }
    }
}
