package fun.commons.gateway4j.engine.config.event;

import fun.commons.gateway4j.common.model.Plugin;
import org.springframework.context.ApplicationEvent;

import java.util.List;

/**
 * Fired after {@code ConfigService.loadAllConfig()} finished applying a full
 * config snapshot. Carries the freshly loaded plugin rows so listeners (e.g.
 * the gateway-boot runtime catalog publisher that mirrors the runtime plugin
 * inventory into Redis for the admin UI) can render what the engine now knows
 * without re-querying the DB.
 */
public class ConfigLoadedEvent extends ApplicationEvent {

    private final List<Plugin> pluginRows;

    public ConfigLoadedEvent(Object source, List<Plugin> pluginRows) {
        super(source);
        this.pluginRows = pluginRows == null ? List.of() : List.copyOf(pluginRows);
    }

    public List<Plugin> getPluginRows() {
        return pluginRows;
    }
}
