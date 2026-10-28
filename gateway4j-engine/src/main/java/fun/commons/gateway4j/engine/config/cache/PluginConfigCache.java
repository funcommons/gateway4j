package fun.commons.gateway4j.engine.config.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import fun.commons.gateway4j.common.model.Plugin;

import java.time.Duration;
import java.util.List;

public class PluginConfigCache {

    private final Cache<Long, Plugin> cache;

    public PluginConfigCache() {
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(10_000)
                .build();
    }

    public Plugin getPlugin(Long id) {
        return cache.getIfPresent(id);
    }

    public List<Plugin> getGlobalPlugins(String phase) {
        return cache.asMap().values().stream()
                .filter(p -> "GLOBAL".equals(p.getScope()))
                .filter(p -> phase.equals(p.getPluginPhase()))
                .filter(p -> "ENABLED".equals(p.getStatus()))
                .sorted((a, b) -> Integer.compare(a.getSortOrder(), b.getSortOrder()))
                .toList();
    }

    public List<Plugin> getRoutePlugins(Long routeId) {
        return cache.asMap().values().stream()
                .filter(p -> "ROUTE".equals(p.getScope()))
                .filter(p -> "ENABLED".equals(p.getStatus()))
                .toList();
    }

    public List<Plugin> getAllPlugins() {
        return cache.asMap().values().stream().toList();
    }

    public void putPlugin(Plugin plugin) {
        cache.put(plugin.getId(), plugin);
    }

    public void invalidatePlugin(Long id) {
        cache.invalidate(id);
    }

    public void refreshAll(List<Plugin> plugins) {
        cache.invalidateAll();
        for (Plugin plugin : plugins) {
            cache.put(plugin.getId(), plugin);
        }
    }
}
