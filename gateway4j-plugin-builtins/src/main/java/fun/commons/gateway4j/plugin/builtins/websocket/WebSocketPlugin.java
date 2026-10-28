package fun.commons.gateway4j.plugin.builtins.websocket;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import org.springframework.web.reactive.socket.client.ReactorNettyWebSocketClient;
import org.springframework.web.reactive.socket.client.WebSocketClient;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebHandler;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.time.Duration;

public class WebSocketPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(WebSocketPlugin.class);

    private volatile WebSocketPluginConfig config;
    private final WebSocketClient wsClient = new ReactorNettyWebSocketClient();

    public WebSocketPlugin() {
        super(BuiltinPluginConstants.WEBSOCKET, "WebSocket代理插件", "PRE", 0);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || config.getUpstreamUrl() == null) {
            return chain.execute(exchange);
        }

        String upgrade = exchange.getRequest().getHeaders().getFirst("Upgrade");
        if (upgrade == null || !upgrade.equalsIgnoreCase("websocket")) {
            return chain.execute(exchange);
        }

        String upstreamUrl = resolveUpstreamUrl(exchange);
        if (upstreamUrl == null) {
            log.warn("WebSocket upstream URL could not be resolved");
            exchange.getResponse().setStatusCode(HttpStatus.BAD_GATEWAY);
            return exchange.getResponse().setComplete();
        }

        URI uri = URI.create(upstreamUrl);
        log.debug("WebSocket proxy: {} -> {}", exchange.getRequest().getURI(), uri);

        HttpHeaders proxyHeaders = new HttpHeaders();
        if (config.isProxyHeaders()) {
            exchange.getRequest().getHeaders().forEach((name, values) -> {
                if (!name.equalsIgnoreCase("upgrade") && !name.equalsIgnoreCase("connection")
                        && !name.equalsIgnoreCase("sec-websocket-key") && !name.equalsIgnoreCase("sec-websocket-version")
                        && !name.equalsIgnoreCase("sec-websocket-extensions") && !name.equalsIgnoreCase("sec-websocket-protocol")
                        && !name.equalsIgnoreCase("host")) {
                    proxyHeaders.addAll(name, values);
                }
            });
        }

        return wsClient.execute(uri, proxyHeaders, upstreamSession -> proxySessions(exchange, upstreamSession));
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), WebSocketPluginConfig.class);
    }

    private String resolveUpstreamUrl(ServerWebExchange exchange) {
        String upstream = config.getUpstreamUrl();
        if (upstream == null) return null;

        if (upstream.startsWith("ws://") || upstream.startsWith("wss://")) {
            String query = exchange.getRequest().getURI().getRawQuery();
            return upstream + (query != null ? "?" + query : "");
        }

        String scheme = exchange.getRequest().getURI().getScheme().equals("https") ? "wss" : "ws";
        String path = exchange.getRequest().getPath().value();
        String query = exchange.getRequest().getURI().getRawQuery();
        return scheme + "://" + upstream + path + (query != null ? "?" + query : "");
    }

    private Mono<Void> proxySessions(ServerWebExchange exchange, WebSocketSession upstreamSession) {
        return exchange.getResponse().writeWith(
                Flux.error(new UnsupportedOperationException(
                        "WebSocket proxy requires WebSocketHandler integration, not standard HTTP response")));
    }
}
