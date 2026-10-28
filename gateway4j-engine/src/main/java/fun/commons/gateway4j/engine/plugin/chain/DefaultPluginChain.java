package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

public class DefaultPluginChain implements PluginChain {

    private final List<GatewayPlugin> plugins;
    private int index;

    public DefaultPluginChain(List<GatewayPlugin> plugins) {
        this.plugins = List.copyOf(plugins);
        this.index = 0;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange) {
        if (index < plugins.size()) {
            GatewayPlugin plugin = plugins.get(index++);
            if (plugin.skip(exchange)) {
                return execute(exchange);
            }
            return plugin.execute(exchange, this);
        }
        return Mono.empty();
    }
}
