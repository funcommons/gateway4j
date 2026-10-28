package fun.commons.gateway4j.plugin.builtins.cache;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class CachePlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(CachePlugin.class);
    private static final String CACHE_KEY_PREFIX = "gw4j:cache:";
    private static final String CACHE_HIT_ATTR = GatewayConstants.PLUGIN_CONTEXT_PREFIX + "cache_hit";
    private static final String CACHE_KEY_ATTR = GatewayConstants.PLUGIN_CONTEXT_PREFIX + "cache_key";

    private final Map<String, CachedResponse> localCache = new ConcurrentHashMap<>();
    private final boolean isPostPhase;
    private volatile CachePluginConfig config;
    private volatile StringRedisTemplate redisTemplate;

    public CachePlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.CACHE_POST : BuiltinPluginConstants.CACHE,
                isPostPhase ? "缓存插件（后置）" : "缓存插件",
                isPostPhase ? "POST" : "PRE",
                2);
        this.isPostPhase = isPostPhase;
    }

    public void setRedisTemplate(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        if (!isPostPhase) {
            return prePhase(exchange, chain);
        }
        return postPhase(exchange, chain);
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), CachePluginConfig.class);
    }

    @Override
    public void onDestroy() {
        localCache.clear();
    }

    private Mono<Void> prePhase(ServerWebExchange exchange, PluginChain chain) {
        String cacheKey = buildCacheKey(exchange);
        exchange.getAttributes().put(CACHE_KEY_ATTR, cacheKey);

        CachedResponse cached = resolveCachedResponse(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.debug("[PRE] cache hit: key={}", cacheKey);
            exchange.getAttributes().put(CACHE_HIT_ATTR, Boolean.TRUE);
            return writeCachedResponse(exchange, cached);
        }

        log.debug("[PRE] cache miss: key={}", cacheKey);
        return chain.execute(exchange);
    }

    private Mono<Void> postPhase(ServerWebExchange exchange, PluginChain chain) {
        Boolean cacheHit = exchange.getAttribute(CACHE_HIT_ATTR);
        if (Boolean.TRUE.equals(cacheHit)) {
            return chain.execute(exchange);
        }

        String cacheKey = exchange.getAttribute(CACHE_KEY_ATTR);
        if (cacheKey == null) {
            return chain.execute(exchange);
        }

        ServerWebExchange mutated = exchange.mutate().response(new CacheCaptureDecorator(exchange, cacheKey)).build();
        return chain.execute(mutated);
    }

    private String buildCacheKey(ServerWebExchange exchange) {
        String method = exchange.getRequest().getMethod().name();
        String path = exchange.getRequest().getPath().value();
        String query = exchange.getRequest().getURI().getRawQuery();
        return method + ":" + path + (query != null ? "?" + query : "");
    }

    private CachedResponse resolveCachedResponse(String cacheKey) {
        if (isDistributed()) {
            return getFromRedis(cacheKey);
        }
        return localCache.get(cacheKey);
    }

    private void storeCachedResponse(String cacheKey, CachedResponse response) {
        if (isDistributed()) {
            storeToRedis(cacheKey, response);
        } else {
            localCache.put(cacheKey, response);
        }
    }

    private boolean isDistributed() {
        return config != null && "DISTRIBUTED".equals(config.getMode()) && redisTemplate != null;
    }

    private CachedResponse getFromRedis(String cacheKey) {
        try {
            String redisKey = CACHE_KEY_PREFIX + cacheKey;
            String raw = redisTemplate.opsForValue().get(redisKey);
            if (raw == null) return null;

            String[] parts = raw.split("\\|", 4);
            if (parts.length < 4) return null;

            long createdAt = Long.parseLong(parts[0]);
            int ttlSeconds = Integer.parseInt(parts[1]);
            int statusCode = Integer.parseInt(parts[2]);
            byte[] body = Base64.getDecoder().decode(parts[3]);

            HttpHeaders headers = new HttpHeaders();
            return new CachedResponse(createdAt, ttlSeconds, body, headers, HttpStatus.valueOf(statusCode));
        } catch (Exception e) {
            log.debug("Redis cache read failed: {}", e.getMessage());
            return null;
        }
    }

    private void storeToRedis(String cacheKey, CachedResponse response) {
        try {
            String redisKey = CACHE_KEY_PREFIX + cacheKey;
            String encoded = response.getCreatedAt() + "|"
                    + response.getTtlSeconds() + "|"
                    + (response.getStatusCode() != null ? response.getStatusCode().value() : 200) + "|"
                    + Base64.getEncoder().encodeToString(response.getBody());
            redisTemplate.opsForValue().set(redisKey, encoded, java.time.Duration.ofSeconds(response.getTtlSeconds()));
        } catch (Exception e) {
            log.warn("Redis cache write failed: {}", e.getMessage());
        }
    }

    private Mono<Void> writeCachedResponse(ServerWebExchange exchange, CachedResponse cached) {
        if (cached.getStatusCode() != null) {
            exchange.getResponse().setStatusCode(cached.getStatusCode());
        }
        if (cached.getHeaders() != null && !cached.getHeaders().isEmpty()) {
            cached.getHeaders().forEach((name, values) -> values.forEach(v -> exchange.getResponse().getHeaders().add(name, v)));
        }
        byte[] body = cached.getBody();
        if (body != null && body.length > 0) {
            exchange.getResponse().getHeaders().setContentLength(body.length);
            DataBuffer buffer = new DefaultDataBufferFactory().wrap(body);
            return exchange.getResponse().writeWith(Mono.just(buffer));
        }
        return exchange.getResponse().setComplete();
    }

    private class CacheCaptureDecorator extends ServerHttpResponseDecorator {

        private final ServerWebExchange exchange;
        private final String cacheKey;

        CacheCaptureDecorator(ServerWebExchange exchange, String cacheKey) {
            super(exchange.getResponse());
            this.exchange = exchange;
            this.cacheKey = cacheKey;
        }

        @Override
        public Mono<Void> writeWith(org.reactivestreams.Publisher<? extends DataBuffer> body) {
            if (body instanceof Flux) {
                Flux<? extends DataBuffer> flux = (Flux<? extends DataBuffer>) body;
                return super.writeWith(flux.reduce(new byte[0],
                                (acc, buf) -> {
                                    byte[] bytes = new byte[buf.readableByteCount()];
                                    buf.read(bytes);
                                    return concat(acc, bytes);
                                })
                        .doOnNext(bodyBytes -> {
                            if (bodyBytes.length <= (config != null ? config.getMaxBodySize() : 1024 * 1024)) {
                                int ttl = config != null ? config.getTtlSeconds() : 300;
                                HttpStatus status = getStatusCode() instanceof HttpStatus hs ? hs : HttpStatus.OK;
                                HttpHeaders headers = new HttpHeaders();
                                getHeaders().forEach((name, values) -> {
                                    if (!name.equalsIgnoreCase("content-length") && !name.equalsIgnoreCase("transfer-encoding")) {
                                        headers.addAll(name, values);
                                    }
                                });
                                CachedResponse cached = new CachedResponse(
                                        System.currentTimeMillis(), ttl, bodyBytes, headers, status);
                                storeCachedResponse(cacheKey, cached);
                                log.debug("[POST] cache store: key={}, size={}bytes", cacheKey, bodyBytes.length);
                            }
                        })
                        .map(bodyBytes -> new DefaultDataBufferFactory().wrap(bodyBytes)));
            }
            return super.writeWith(body);
        }

        private byte[] concat(byte[] a, byte[] b) {
            byte[] result = new byte[a.length + b.length];
            System.arraycopy(a, 0, result, 0, a.length);
            System.arraycopy(b, 0, result, a.length, b.length);
            return result;
        }
    }
}
