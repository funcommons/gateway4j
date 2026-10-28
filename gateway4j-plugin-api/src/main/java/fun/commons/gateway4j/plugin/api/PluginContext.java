package fun.commons.gateway4j.plugin.api;

import org.springframework.web.server.ServerWebExchange;

import java.util.Map;

public interface PluginContext {

    <T> T get(String key, Class<T> type);

    void set(String key, Object value);

    ServerWebExchange exchange();
}
