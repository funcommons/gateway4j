package fun.commons.gateway4j.gateway.config;

import fun.commons.framework4j.redis.manager.MultiRedisManager;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mirrors the engine's runtime plugin inventory into Redis after every config
 * reload, so the admin side can display what actually executes on the data
 * plane (registered instances vs. configured-but-silently-skipped plugin rows).
 *
 * <p>Cross-agent contract (verbatim, do not rename): Redis key
 * {@code gateway4j:plugin:runtime}, value = JSON array string
 * {@code [{"plugin_id":"security","phase":"PRE","registered":true,"updated_at":epoch_ms}, ...]},
 * overwrite-write, TTL 10 minutes as a safety net.</p>
 *
 * <p>Catalog composition: every registered runtime instance (registered=true,
 * phase from the instance) first, then every ENABLED plugin row whose
 * plugin_id has no runtime instance (registered=false, phase from the row) —
 * deduplicated by plugin_id. Entirely fail-open: any Redis error is logged and
 * swallowed, config reload must never depend on this side channel.</p>
 */
public class PluginRuntimeCatalogPublisher {

    private static final Logger log = LoggerFactory.getLogger(PluginRuntimeCatalogPublisher.class);

    /** Cross-agent contract key (admin side reads it) — keep verbatim. */
    public static final String RUNTIME_CATALOG_KEY = "gateway4j:plugin:runtime";
    private static final Duration TTL = Duration.ofMinutes(10);

    private final MultiRedisManager redisManager;
    private final PluginInstanceRegistry pluginRegistry;

    public PluginRuntimeCatalogPublisher(MultiRedisManager redisManager, PluginInstanceRegistry pluginRegistry) {
        this.redisManager = redisManager;
        this.pluginRegistry = pluginRegistry;
    }

    @EventListener
    public void onConfigLoaded(ConfigLoadedEvent event) {
        try {
            String json = JsonUtils.toJson(buildCatalog(
                    pluginRegistry.instances(), event.getPluginRows(), System.currentTimeMillis()));
            redisManager.getStringRedisTemplate().opsForValue().set(RUNTIME_CATALOG_KEY, json, TTL);
            log.info("Runtime plugin catalog published to Redis key {} ({} entries, ttl={}s)",
                    RUNTIME_CATALOG_KEY, json.length() >= 2 ? countEntries(json) : 0, TTL.toSeconds());
        } catch (Exception e) {
            log.warn("Failed to publish runtime plugin catalog to Redis (fail-open): {}", e.getMessage());
        }
    }

    static int countEntries(String json) {
        // cheap sanity count for the log line; the array itself is the contract payload
        int commas = 0;
        for (int i = 0; i < json.length(); i++) {
            if (json.charAt(i) == ',') {
                commas++;
            }
        }
        return commas == 0 ? (json.length() > 2 ? 1 : 0) : commas + 1;
    }

    /**
     * Pure catalog builder (unit-testable): registered instances first, then
     * unregistered ENABLED rows, dedup by plugin_id, stable order.
     */
    static List<Map<String, Object>> buildCatalog(Map<String, GatewayPlugin> instances,
                                                  List<Plugin> pluginRows,
                                                  long nowEpochMs) {
        Set<String> seen = new LinkedHashSet<>();
        List<Map<String, Object>> catalog = new ArrayList<>();
        for (Map.Entry<String, GatewayPlugin> e : instances.entrySet()) {
            if (seen.add(e.getKey())) {
                catalog.add(entry(e.getKey(), e.getValue() != null ? e.getValue().phase() : null, true, nowEpochMs));
            }
        }
        if (pluginRows != null) {
            Set<String> instanceIds = instances == null ? Set.of() : new HashSet<>(instances.keySet());
            for (Plugin row : pluginRows) {
                if (row == null || row.getPluginId() == null
                        || !"ENABLED".equals(row.getStatus())
                        || !seen.add(row.getPluginId())) {
                    continue;
                }
                catalog.add(entry(row.getPluginId(), row.getPluginPhase(), false, nowEpochMs));
            }
        }
        return catalog;
    }

    private static Map<String, Object> entry(String pluginId, String phase, boolean registered, long nowEpochMs) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("plugin_id", pluginId);
        entry.put("phase", phase);
        entry.put("registered", registered);
        entry.put("updated_at", nowEpochMs);
        return entry;
    }
}
