package fun.commons.gateway4j.plugin.builtins.keyauth;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;

public class KeyAuthPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(KeyAuthPlugin.class);

    private volatile KeyAuthPluginConfig config;

    public KeyAuthPlugin() {
        super(BuiltinPluginConstants.KEY_AUTH, "API Key认证插件", "PRE", 3);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        if (config.getKeyName() == null || config.getKeyName().isBlank()
                || config.getKey() == null || config.getKey().isBlank()) {
            log.warn("KeyAuth plugin configured with blank keyName or key, skipping authentication");
            return chain.execute(exchange);
        }

        if (checkKey(exchange, config.getKeyName(), config.getKey())) {
            return chain.execute(exchange);
        }

        log.warn("Key auth failed for keyName: {}", config.getKeyName());
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), KeyAuthPluginConfig.class);
    }

    private boolean checkKey(ServerWebExchange exchange, String keyName, String key) {
        String headerValue = exchange.getRequest().getHeaders().getFirst(keyName);
        if (headerValue != null && constantTimeEquals(key, headerValue)) {
            return true;
        }

        String queryValue = exchange.getRequest().getQueryParams().getFirst(keyName);
        return queryValue != null && constantTimeEquals(key, queryValue);
    }

    private boolean constantTimeEquals(String a, String b) {
        byte[] aBytes = a.getBytes(StandardCharsets.UTF_8);
        byte[] bBytes = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(aBytes, bBytes);
    }
}
