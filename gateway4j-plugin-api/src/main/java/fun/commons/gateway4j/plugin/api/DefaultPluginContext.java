package fun.commons.gateway4j.plugin.api;

import org.springframework.web.server.ServerWebExchange;

public class DefaultPluginContext implements PluginContext {

    private final ServerWebExchange exchange;

    public DefaultPluginContext(ServerWebExchange exchange) {
        this.exchange = exchange;
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Class<T> type) {
        Object value = exchange.getAttributes().get(key);
        if (value == null) {
            return null;
        }
        if (!type.isInstance(value)) {
            throw new ClassCastException(
                    "PluginContext value for key '" + key + "' is " + value.getClass().getName()
                            + ", expected " + type.getName());
        }
        return (T) value;
    }

    @Override
    public void set(String key, Object value) {
        exchange.getAttributes().put(key, value);
    }

    @Override
    public ServerWebExchange exchange() {
        return exchange;
    }
}
