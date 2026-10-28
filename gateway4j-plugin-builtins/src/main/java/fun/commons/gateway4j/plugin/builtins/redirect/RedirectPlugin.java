package fun.commons.gateway4j.plugin.builtins.redirect;

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

public class RedirectPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(RedirectPlugin.class);

    private volatile RedirectPluginConfig config;

    public RedirectPlugin() {
        super(BuiltinPluginConstants.REDIRECT, "重定向插件", "PRE", 21);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        if (config.getRedirectURI() == null || config.getRedirectURI().isEmpty()) {
            return chain.execute(exchange);
        }

        String redirectURI = config.getRedirectURI();

        if (redirectURI.startsWith("/")) {
            if (redirectURI.length() > 1 && redirectURI.charAt(1) == '/') {
                log.warn("Potential SSRF via protocol-relative redirect URI: {}", redirectURI);
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
            log.debug("Internal forward to: {}", redirectURI);
            ServerWebExchange mutated = exchange.mutate().request(builder -> builder.path(redirectURI)).build();
            return chain.execute(mutated);
        }

        int statusCode = resolveStatusCode(config.getHttpStatusCode(), 302);
        log.debug("External redirect to: {} with status {}", redirectURI, statusCode);
        exchange.getResponse().setStatusCode(HttpStatus.valueOf(statusCode));
        exchange.getResponse().getHeaders().set("Location", redirectURI);
        return exchange.getResponse().setComplete();
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), RedirectPluginConfig.class);
    }

    private int resolveStatusCode(Integer configured, int fallback) {
        if (configured == null) return fallback;
        try {
            HttpStatus.valueOf(configured);
            return configured;
        } catch (IllegalArgumentException e) {
            log.warn("Invalid redirect status code {}, falling back to {}", configured, fallback);
            return fallback;
        }
    }
}
