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
 *
 * <p>{@code maxConfigVersion} is the max {@code config_version} across ALL rows
 * of the loaded snapshot (gw_route ∪ gw_plugin, null → 0). The gateway-boot
 * config sync-status publisher (P1-3) reports it as the {@code version} field of
 * the {@code gateway4j:config:sync} Redis key.</p>
 */
public class ConfigLoadedEvent extends ApplicationEvent {

    private final List<Plugin> pluginRows;
    private final long maxConfigVersion;

    public ConfigLoadedEvent(Object source, List<Plugin> pluginRows) {
        this(source, pluginRows, 0L);
    }

    public ConfigLoadedEvent(Object source, List<Plugin> pluginRows, long maxConfigVersion) {
        super(source);
        this.pluginRows = pluginRows == null ? List.of() : List.copyOf(pluginRows);
        this.maxConfigVersion = maxConfigVersion;
    }

    public List<Plugin> getPluginRows() {
        return pluginRows;
    }

    /** Max {@code config_version} over the loaded route + plugin rows (0 when none). */
    public long getMaxConfigVersion() {
        return maxConfigVersion;
    }
}
