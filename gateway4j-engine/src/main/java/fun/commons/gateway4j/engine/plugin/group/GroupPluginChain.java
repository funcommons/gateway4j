package fun.commons.gateway4j.engine.plugin.group;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

class GroupPluginChain implements PluginChain {

    private final List<GatewayPlugin> members;
    private final PluginChain parentChain;
    private int index;

    GroupPluginChain(List<GatewayPlugin> members, PluginChain parentChain) {
        this.members = members;
        this.parentChain = parentChain;
        this.index = 0;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange) {
        if (index < members.size()) {
            GatewayPlugin plugin = members.get(index++);
            if (plugin.skip(exchange)) {
                return execute(exchange);
            }
            return plugin.execute(exchange, this);
        }
        return parentChain.execute(exchange);
    }
}
