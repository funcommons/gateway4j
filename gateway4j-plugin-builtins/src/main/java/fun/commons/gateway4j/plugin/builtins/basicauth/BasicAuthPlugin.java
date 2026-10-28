package fun.commons.gateway4j.plugin.builtins.basicauth;

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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;

public class BasicAuthPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(BasicAuthPlugin.class);
    private static final String AUTH_HEADER = "Authorization";
    private static final String BASIC_PREFIX = "Basic ";

    private volatile BasicAuthPluginConfig config;

    public BasicAuthPlugin() {
        super(BuiltinPluginConstants.BASIC_AUTH, "Basic认证插件", "PRE", 2);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getAccounts() == null || config.getAccounts().isEmpty()) {
            return chain.execute(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(AUTH_HEADER);
        if (authHeader == null || !authHeader.startsWith(BASIC_PREFIX)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            exchange.getResponse().getHeaders().set("WWW-Authenticate", "Basic realm=\"Gateway\"");
            return exchange.getResponse().setComplete();
        }

        String decoded;
        try {
            decoded = new String(Base64.getDecoder().decode(authHeader.substring(BASIC_PREFIX.length())), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            log.debug("Basic auth decode failed: {}", e.getMessage());
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        int colonIndex = decoded.indexOf(':');
        if (colonIndex <= 0) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String username = decoded.substring(0, colonIndex);
        String password = decoded.substring(colonIndex + 1);

        String expectedPassword = config.getAccounts().get(username);
        if (expectedPassword == null) {
            log.debug("Basic auth unknown user: {}", username);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        if (!constantTimeEquals(password, expectedPassword)) {
            log.debug("Basic auth invalid password for user: {}", username);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        var requestBuilder = exchange.getRequest().mutate();
        requestBuilder.header("X-User", username);
        return chain.execute(exchange.mutate().request(requestBuilder.build()).build());
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), BasicAuthPluginConfig.class);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
