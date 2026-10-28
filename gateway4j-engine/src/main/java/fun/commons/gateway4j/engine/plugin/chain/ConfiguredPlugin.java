package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginConfig;

/**
 * Adapter that pins an execution order (from the DB row / binding sort_order)
 * onto a shared {@link GatewayPlugin} instance, so chains can be ordered by
 * configuration instead of by the instance's built-in order.
 *
 * <p>The delegate instance is shared between chains (it is a singleton keyed by
 * plugin_id); only ordering is per-chain. Config is delivered to the delegate
 * via {@link GatewayPlugin#onConfigChange(PluginConfig)} by the
 * PluginInstanceRegistry, not through this adapter.</p>
 */
public class ConfiguredPlugin implements GatewayPlugin {

    private final GatewayPlugin delegate;
    private final int order;

    public ConfiguredPlugin(GatewayPlugin delegate, int order) {
        this.delegate = delegate;
        this.order = order;
    }

    public GatewayPlugin delegate() {
        return delegate;
    }

    @Override
    public String pluginId() {
        return delegate.pluginId();
    }

    @Override
    public String pluginName() {
        return delegate.pluginName();
    }

    @Override
    public String phase() {
        return delegate.phase();
    }

    @Override
    public int order() {
        return order;
    }

    @Override
    public boolean skip(org.springframework.web.server.ServerWebExchange exchange) {
        return delegate.skip(exchange);
    }

    @Override
    public reactor.core.publisher.Mono<Void> execute(org.springframework.web.server.ServerWebExchange exchange,
                                                     fun.commons.gateway4j.plugin.api.PluginChain chain) {
        return delegate.execute(exchange, chain);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        delegate.onConfigChange(config);
    }

    @Override
    public void onDestroy() {
        delegate.onDestroy();
    }

    @Override
    public String configSchema() {
        return delegate.configSchema();
    }
}
