package fun.commons.gateway4j.engine.plugin.group;

import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

public class GroupPlugin extends AbstractGatewayPlugin {

    private final List<GatewayPlugin> members;

    public GroupPlugin(String pluginId, String pluginName, String phase, int order,
                       List<GatewayPlugin> members) {
        super(pluginId, pluginName, phase, order);
        this.members = List.copyOf(members);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        PluginChain subChain = new GroupPluginChain(members, chain);
        return subChain.execute(exchange);
    }

    public List<GatewayPlugin> members() {
        return members;
    }
}
