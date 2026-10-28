package fun.commons.gateway4j.plugin.builtins.security;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;

public class SecurityPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(SecurityPlugin.class);

    private volatile SecurityPluginConfig config;

    public SecurityPlugin() {
        super(BuiltinPluginConstants.SECURITY, "安全插件", "PRE", 1);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String clientIp = resolveClientIp(exchange);

        if (config.getIpBlacklist() != null && isIpMatched(clientIp, config.getIpBlacklist())) {
            log.warn("IP blacklisted: {}", clientIp);
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        if (config.getIpWhitelist() != null && !config.getIpWhitelist().isEmpty()) {
            if (!isIpMatched(clientIp, config.getIpWhitelist())) {
                log.warn("IP not in whitelist: {}", clientIp);
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
        }

        if (config.getRequiredHeaders() != null) {
            HttpHeaders headers = exchange.getRequest().getHeaders();
            for (Map.Entry<String, String> entry : config.getRequiredHeaders().entrySet()) {
                String headerValue = headers.getFirst(entry.getKey());
                if (headerValue == null || !headerValue.equals(entry.getValue())) {
                    log.warn("Required header missing or mismatched: {}", entry.getKey());
                    exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                    return exchange.getResponse().setComplete();
                }
            }
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), SecurityPluginConfig.class);
    }

    private String resolveClientIp(ServerWebExchange exchange) {
        String ip = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (ip != null && !ip.isEmpty()) {
            return ip.split(",")[0].trim();
        }
        ip = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
        if (ip != null && !ip.isEmpty()) {
            return ip.trim();
        }
        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        return remoteAddress != null ? remoteAddress.getAddress().getHostAddress() : "unknown";
    }

    private boolean isIpMatched(String clientIp, List<String> patterns) {
        for (String pattern : patterns) {
            if (pattern.endsWith("/*")) {
                String prefix = pattern.substring(0, pattern.length() - 2);
                if (clientIp.startsWith(prefix)) {
                    return true;
                }
            } else if (clientIp.equals(pattern)) {
                return true;
            }
        }
        return false;
    }
}
