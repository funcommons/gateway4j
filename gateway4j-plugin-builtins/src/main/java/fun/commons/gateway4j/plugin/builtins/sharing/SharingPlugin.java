package fun.commons.gateway4j.plugin.builtins.sharing;

import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public class SharingPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(SharingPlugin.class);
    private static final String SHARED_DATA_PREFIX = "gw4j:shared:";

    private final boolean isPostPhase;

    public SharingPlugin(boolean isPostPhase) {
        super(isPostPhase ? BuiltinPluginConstants.SHARING_POST : BuiltinPluginConstants.SHARING,
                isPostPhase ? "共享插件（后置）" : "共享插件",
                isPostPhase ? "POST" : "PRE",
                4);
        this.isPostPhase = isPostPhase;
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (!isPostPhase) {
            // PRE: propagate shared data from previous plugins into downstream headers
            exchange.getAttributes().entrySet().stream()
                    .filter(e -> e.getKey().startsWith(SHARED_DATA_PREFIX))
                    .forEach(e -> exchange.getRequest().mutate()
                            .header("X-Gw4j-" + e.getKey().substring(SHARED_DATA_PREFIX.length()),
                                    String.valueOf(e.getValue()))
                            .build());
        }
        // POST: no-op, other plugins write to shared attributes directly
        return chain.execute(exchange);
    }

    public static void setSharedData(ServerWebExchange exchange, String key, Object value) {
        exchange.getAttributes().put(SHARED_DATA_PREFIX + key, value);
    }

    @SuppressWarnings("unchecked")
    public static <T> T getSharedData(ServerWebExchange exchange, String key) {
        return (T) exchange.getAttribute(SHARED_DATA_PREFIX + key);
    }
}
