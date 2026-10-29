package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.common.util.JsonUtils;
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
 *
 * <p>on_error policy (P1-2): the generic {@code "on_error"} key inside the
 * plugin row's {@code gw_plugin.config} JSON selects what happens when the
 * plugin throws — {@code "open"} (default) fail-open continue,
 * {@code "close"} short-circuit the request with 503 (see
 * FailSafePluginChainRunner). Parsed once at chain composition, generically for
 * every plugin (no per-plugin config POJO change needed).</p>
 */
public class ConfiguredPlugin implements GatewayPlugin {

    /** Default policy: fail-open (historical behavior). */
    public static final String ON_ERROR_OPEN = "open";
    /** Strict policy: a throwing plugin short-circuits the request with 503. */
    public static final String ON_ERROR_CLOSE = "close";

    private final GatewayPlugin delegate;
    private final int order;
    private final String onError;

    public ConfiguredPlugin(GatewayPlugin delegate, int order) {
        this(delegate, order, null);
    }

    /**
     * @param configJson the plugin row's raw {@code gw_plugin.config} JSON; only
     *                   its optional generic {@code "on_error"} key is read here
     */
    public ConfiguredPlugin(GatewayPlugin delegate, int order, String configJson) {
        this.delegate = delegate;
        this.order = order;
        this.onError = extractOnError(configJson);
    }

    public GatewayPlugin delegate() {
        return delegate;
    }

    /** {@code "open"} (default) or {@code "close"} — see class docs. */
    public String onError() {
        return onError;
    }

    /**
     * Generic extraction of the optional {@code "on_error"} key from a plugin
     * config JSON. Anything absent/unparseable/unknown resolves to
     * {@link #ON_ERROR_OPEN} (fail-open, historical default). Cheap substring
     * gate avoids a JSON parse on the per-request composition hot path.
     */
    public static String extractOnError(String configJson) {
        if (configJson == null || !configJson.contains("on_error")) {
            return ON_ERROR_OPEN;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode node = JsonUtils.mapper().readTree(configJson);
            String value = node.path("on_error").asText(null);
            return ON_ERROR_CLOSE.equalsIgnoreCase(value) ? ON_ERROR_CLOSE : ON_ERROR_OPEN;
        } catch (Exception e) {
            return ON_ERROR_OPEN;
        }
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
