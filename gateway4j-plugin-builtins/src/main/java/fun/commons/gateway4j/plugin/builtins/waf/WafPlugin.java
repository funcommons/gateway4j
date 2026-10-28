package fun.commons.gateway4j.plugin.builtins.waf;

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

public class WafPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(WafPlugin.class);
    private static final String MODEL_BLACK = "black";
    private static final String MODEL_MIXED = "mixed";
    private static final String PERMISSION_REJECT = "reject";
    private static final String PERMISSION_ALLOW = "allow";

    private volatile WafPluginConfig config;

    public WafPlugin() {
        super(BuiltinPluginConstants.WAF, "WAF防火墙插件", "PRE", 0);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String model = config.getModel() != null ? config.getModel() : MODEL_BLACK;
        String permission = config.getPermission();

        if (permission == null || permission.isEmpty()) {
            if (MODEL_MIXED.equals(model)) {
                log.debug("WAF mixed mode: no rule matched, rejecting");
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
            return chain.execute(exchange);
        }

        if (PERMISSION_REJECT.equals(permission)) {
            int statusCode = resolveStatusCode(config.getStatusCode(), HttpStatus.FORBIDDEN.value());
            log.debug("WAF rejecting request with status {}", statusCode);
            exchange.getResponse().setStatusCode(HttpStatus.valueOf(statusCode));
            return exchange.getResponse().setComplete();
        }

        if (PERMISSION_ALLOW.equals(permission)) {
            return chain.execute(exchange);
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), WafPluginConfig.class);
    }

    private int resolveStatusCode(Integer configured, int fallback) {
        if (configured == null) return fallback;
        try {
            HttpStatus.valueOf(configured);
            return configured;
        } catch (IllegalArgumentException e) {
            log.warn("Invalid WAF status code {}, falling back to {}", configured, fallback);
            return fallback;
        }
    }
}
