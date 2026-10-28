package fun.commons.gateway4j.engine.plugin.runtime;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Maps the plugin_id persisted in gw_plugin to the runtime {@link GatewayPlugin}
 * instance that implements it, and pushes DB config rows into the instances
 * (via {@link GatewayPlugin#onConfigChange(PluginConfig)}) whenever the engine
 * reloads configuration.
 *
 * <p>Plugin rows whose plugin_id has no registered instance (GROOVY / JAR
 * plugins, or unknown builtin ids) are skipped with a warning: fail-open, they
 * simply do not execute. This is the single point where "config world" meets
 * "runtime world" for plugins.</p>
 */
public class PluginInstanceRegistry {

    private static final Logger log = LoggerFactory.getLogger(PluginInstanceRegistry.class);

    private final Map<String, GatewayPlugin> instances = new ConcurrentHashMap<>();

    public void register(GatewayPlugin plugin) {
        instances.put(plugin.pluginId(), plugin);
    }

    public GatewayPlugin find(String pluginId) {
        if (pluginId == null) {
            return null;
        }
        return instances.get(pluginId);
    }

    public boolean isRegistered(String pluginId) {
        return pluginId != null && instances.containsKey(pluginId);
    }

    /**
     * Stable (plugin_id ordered) snapshot of all registered instances — used for
     * runtime inventory reporting (e.g. the Redis runtime catalog), not for lookup.
     */
    public java.util.LinkedHashMap<String, GatewayPlugin> instances() {
        return instances.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue,
                        (a, b) -> a, java.util.LinkedHashMap::new));
    }

    /**
     * Push the persisted config of every plugin row into the matching runtime
     * instance. Rows without a registered instance are logged (once per reload)
     * and skipped; config parse failures are fail-open (instance keeps its
     * previous config).
     */
    public void applyPluginConfigs(List<Plugin> pluginRows) {
        if (pluginRows == null) {
            return;
        }
        for (Plugin row : pluginRows) {
            GatewayPlugin instance = find(row.getPluginId());
            if (instance == null) {
                if (!"ENABLED".equals(row.getStatus())) {
                    continue;
                }
                log.warn("Plugin row {} (plugin_id={}, type={}) has no runtime instance, it will not execute",
                        row.getId(), row.getPluginId(), row.getPluginType());
                continue;
            }
            try {
                long version = row.getConfigVersion() != null ? row.getConfigVersion() : 0L;
                instance.onConfigChange(new PluginConfig(row.getPluginId(), row.getConfig(), version));
            } catch (Exception e) {
                log.warn("Failed to apply config to plugin {} (fail-open): {}",
                        row.getPluginId(), e.getMessage());
            }
        }
    }
}
