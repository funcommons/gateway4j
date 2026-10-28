package fun.commons.gateway4j.plugin.api;

import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public abstract class AbstractGatewayPlugin implements GatewayPlugin {

    private final String pluginId;
    private final String pluginName;
    private final String phase;
    private final int order;

    protected AbstractGatewayPlugin(String pluginId, String pluginName, String phase, int order) {
        this.pluginId = pluginId;
        this.pluginName = pluginName;
        this.phase = phase;
        this.order = order;
    }

    @Override
    public String pluginId() {
        return pluginId;
    }

    @Override
    public String pluginName() {
        return pluginName;
    }

    @Override
    public String phase() {
        return phase;
    }

    @Override
    public int order() {
        return order;
    }

    @Override
    public boolean skip(ServerWebExchange exchange) {
        return false;
    }

    @Override
    public void onConfigChange(PluginConfig config) {}

    @Override
    public void onDestroy() {}
}
