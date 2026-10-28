package fun.commons.gateway4j.plugin.api;

import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public interface GatewayPlugin {

    String pluginId();

    String pluginName();

    String phase();

    int order();

    default boolean skip(ServerWebExchange exchange) {
        return false;
    }

    Mono<Void> execute(ServerWebExchange exchange, PluginChain chain);

    default void onConfigChange(PluginConfig config) {}

    default void onDestroy() {}

    /**
     * Returns a JSON Schema describing this plugin's config, used by the admin
     * console to generate a dynamic configuration form. Default: permissive object.
     */
    default String configSchema() {
        return "{\"type\":\"object\"}";
    }
}
