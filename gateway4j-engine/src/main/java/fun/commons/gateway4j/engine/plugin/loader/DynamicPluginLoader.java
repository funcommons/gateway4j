package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.PluginGroovy;
import fun.commons.gateway4j.common.model.PluginJar;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;

import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Loads and keeps in sync the runtime instances of dynamic plugins —
 * {@code gw_plugin} rows with {@code plugin_type} GROOVY / JAR — into the
 * {@link PluginInstanceRegistry} (ADR-003 phase 1). This is the engine-side
 * consumer of what the admin side persists: ENABLED rows become instances,
 * everything else does not.
 *
 * <p>Trigger: {@link ConfigLoadedEvent} (fired by {@code ConfigService} after
 * every reload — startup seed, 60s poll, Redis config push, admin API write).
 * For every ENABLED GROOVY row the matching {@code gw_plugin_groovy} extension
 * row (joined via {@code gw_plugin.id}) is sandbox-compiled; for every ENABLED
 * JAR row the stored jar is validated and loaded. Instances are wrapped by
 * {@link TimeoutGuardedPlugin} (row-bound id + exec timeout) and registered;
 * their row config is pushed once via {@code onConfigChange} (fresh
 * registrations only — the registry pushes subsequent config bumps itself).</p>
 *
 * <p>Lifecycle / Metaspace guard (ADR-003): when a row's content fingerprint
 * (script_md5 / jar_md5+main_class) changed, or the row disappeared / was
 * disabled, the OLD handle is closed FIRST ({@code onDestroy()} then the
 * classloader) and only then — for replacements — the new one is built.
 * Classloaders are never shared between generations.</p>
 *
 * <p>Fail-closed per row: a compile/validation failure logs ERROR and leaves the
 * id unregistered — the data plane composition then counts the row as
 * {@code skipped} per request (the {@code gateway4j_plugin_execution}
 * {@code result=skipped} counter) and the row's own {@code on_error} policy is
 * never reached.</p>
 */
public class DynamicPluginLoader {

    private static final Logger log = LoggerFactory.getLogger(DynamicPluginLoader.class);

    private static final String TYPE_GROOVY = "GROOVY";
    private static final String TYPE_JAR = "JAR";
    private static final String STATUS_ENABLED = "ENABLED";

    private final PluginInstanceRegistry registry;
    private final GroovyPluginLoader groovyLoader;
    private final JarPluginLoader jarLoader;
    private final Supplier<List<PluginGroovy>> groovyRowSource;
    private final Supplier<List<PluginJar>> jarRowSource;
    private final Duration execTimeout;

    /** plugin_id (gw_plugin.plugin_id string) → live handle + content fingerprint. */
    private final ConcurrentHashMap<String, LoadedHandle> active = new ConcurrentHashMap<>();

    private record LoadedHandle(AutoCloseable handle, String fingerprint) {
    }

    public DynamicPluginLoader(PluginInstanceRegistry registry,
                               GroovyPluginLoader groovyLoader,
                               JarPluginLoader jarLoader,
                               Supplier<List<PluginGroovy>> groovyRowSource,
                               Supplier<List<PluginJar>> jarRowSource,
                               Duration execTimeout) {
        this.registry = registry;
        this.groovyLoader = groovyLoader;
        this.jarLoader = jarLoader;
        this.groovyRowSource = groovyRowSource;
        this.jarRowSource = jarRowSource;
        this.execTimeout = execTimeout;
    }

    /** Fired by ConfigService after every successful config reload. */
    @EventListener
    public void onConfigLoaded(ConfigLoadedEvent event) {
        try {
            sync(event.getPluginRows());
        } catch (Exception e) {
            // fail-open: a broken dynamic-plugin refresh must not break the config reload
            log.error("Dynamic plugin sync failed (existing instances keep running): {}", e.toString(), e);
        }
    }

    /** Number of currently registered dynamic plugin instances. */
    public int activeCount() {
        return active.size();
    }

    /**
     * Reconciles the registry with the given {@code gw_plugin} rows plus the
     * extension-row sources. Public so tests can drive it directly.
     */
    public synchronized void sync(List<Plugin> pluginRows) {
        List<Plugin> rows = pluginRows == null ? List.of() : pluginRows;

        Map<String, Plugin> desiredGroovy = new HashMap<>();
        Map<String, Plugin> desiredJar = new HashMap<>();
        for (Plugin row : rows) {
            if (row == null || !STATUS_ENABLED.equals(row.getStatus())) {
                continue; // 只有 ENABLED 的行才装载
            }
            if (TYPE_GROOVY.equals(row.getPluginType()) && row.getPluginId() != null) {
                desiredGroovy.put(row.getPluginId(), row);
            } else if (TYPE_JAR.equals(row.getPluginType()) && row.getPluginId() != null) {
                desiredJar.put(row.getPluginId(), row);
            }
        }

        Map<Long, PluginGroovy> groovyByRowId = indexGroovyRows();
        Map<Long, PluginJar> jarByRowId = indexJarRows();

        Set<String> stillActive = new HashSet<>();
        syncGroovy(desiredGroovy, groovyByRowId, stillActive);
        syncJar(desiredJar, jarByRowId, stillActive);

        // evict: disabled / deleted / type-changed rows must not keep running
        for (Map.Entry<String, LoadedHandle> entry : active.entrySet()) {
            if (!stillActive.contains(entry.getKey())) {
                evict(entry.getKey(), entry.getValue(), "row disabled, deleted or type changed");
            }
        }
    }

    private void syncGroovy(Map<String, Plugin> desired, Map<Long, PluginGroovy> extensions,
                            Set<String> stillActive) {
        for (Map.Entry<String, Plugin> entry : desired.entrySet()) {
            String pluginId = entry.getKey();
            Plugin row = entry.getValue();
            PluginGroovy ext = extensions.get(row.getId());
            if (ext == null) {
                log.warn("GROOVY plugin {} ({}) has no gw_plugin_groovy row yet (admin write pending?), skipped",
                        row.getId(), pluginId);
                continue;
            }
            String fingerprint = "groovy:" + (blank(ext.getScriptMd5())
                    ? GroovyPluginLoader.md5Hex(ext.getScriptContent() == null ? "" : ext.getScriptContent())
                    : ext.getScriptMd5().trim().toLowerCase());
            LoadedHandle current = active.get(pluginId);
            if (current != null && current.fingerprint().equals(fingerprint)) {
                stillActive.add(pluginId);
                continue; // unchanged script — keep the compiled instance
            }
            // ADR-003 lifecycle: close the OLD classloader BEFORE building the new one
            if (current != null) {
                evict(pluginId, current, "script changed");
            }
            try {
                GroovyPluginHandle handle = groovyLoader.load(ext);
                register(pluginId, row, handle.instance(), handle, fingerprint);
                stillActive.add(pluginId);
            } catch (PluginLoadException e) {
                // 编译失败 / 校验失败：ERROR 日志 + 不注册 → 数据面按 skipped 计数
                log.error("Groovy plugin {} NOT loaded (skipped): {}", pluginId, e.getMessage());
            }
        }
    }

    private void syncJar(Map<String, Plugin> desired, Map<Long, PluginJar> extensions,
                         Set<String> stillActive) {
        for (Map.Entry<String, Plugin> entry : desired.entrySet()) {
            String pluginId = entry.getKey();
            Plugin row = entry.getValue();
            PluginJar ext = extensions.get(row.getId());
            if (ext == null) {
                log.warn("JAR plugin {} ({}) has no gw_plugin_jar row yet, skipped",
                        row.getId(), pluginId);
                continue;
            }
            String fingerprint = "jar:" + (blank(ext.getJarMd5()) ? "" : ext.getJarMd5().trim().toLowerCase())
                    + ":" + (ext.getMainClass() == null ? "" : ext.getMainClass().trim());
            LoadedHandle current = active.get(pluginId);
            if (current != null && current.fingerprint().equals(fingerprint)) {
                stillActive.add(pluginId);
                continue;
            }
            if (current != null) {
                evict(pluginId, current, "jar changed");
            }
            try {
                JarPluginHandle handle = jarLoader.load(ext);
                register(pluginId, row, handle.instance(), handle, fingerprint);
                stillActive.add(pluginId);
            } catch (PluginLoadException e) {
                log.error("JAR plugin {} NOT loaded (skipped): {}", pluginId, e.getMessage());
            }
        }
    }

    private void register(String pluginId, Plugin row, GatewayPlugin raw,
                          AutoCloseable handle, String fingerprint) {
        if (raw.pluginId() != null && !raw.pluginId().equals(pluginId)) {
            log.warn("Dynamic plugin instance declares id '{}' but its gw_plugin row is '{}' — "
                    + "the row id wins (forced by TimeoutGuardedPlugin)", raw.pluginId(), pluginId);
        }
        GatewayPlugin wrapped = new TimeoutGuardedPlugin(raw, pluginId, execTimeout);
        registry.register(wrapped);
        active.put(pluginId, new LoadedHandle(handle, fingerprint));
        // fresh registration: push the row's persisted config once (subsequent bumps
        // flow through PluginInstanceRegistry.applyPluginConfigs on every reload)
        try {
            long version = row.getConfigVersion() != null ? row.getConfigVersion() : 0L;
            wrapped.onConfigChange(new PluginConfig(pluginId, row.getConfig(), version));
        } catch (Exception e) {
            log.warn("Config push to dynamic plugin {} failed (fail-open): {}",
                    pluginId, e.toString());
        }
        log.info("Dynamic plugin registered: id={} type={} (active dynamic plugins: {})",
                pluginId, row.getPluginType(), active.size());
    }

    private void evict(String pluginId, LoadedHandle handle, String reason) {
        active.remove(pluginId);
        registry.unregister(pluginId);
        try {
            handle.handle().close(); // onDestroy() + classloader close (Metaspace guard)
        } catch (Exception e) {
            log.warn("Closing plugin handle {} failed (ignored): {}", pluginId, e.toString());
        }
        log.info("Dynamic plugin unloaded: id={} ({})", pluginId, reason);
    }

    private Map<Long, PluginGroovy> indexGroovyRows() {
        Map<Long, PluginGroovy> out = new HashMap<>();
        List<PluginGroovy> rows = safeGet(groovyRowSource);
        for (PluginGroovy row : rows) {
            if (row != null && row.getPluginId() != null) {
                out.put(row.getPluginId(), row);
            }
        }
        return out;
    }

    private Map<Long, PluginJar> indexJarRows() {
        Map<Long, PluginJar> out = new HashMap<>();
        List<PluginJar> rows = safeGetJar(jarRowSource);
        for (PluginJar row : rows) {
            if (row != null && row.getPluginId() != null) {
                out.put(row.getPluginId(), row);
            }
        }
        return out;
    }

    private List<PluginGroovy> safeGet(Supplier<List<PluginGroovy>> source) {
        try {
            List<PluginGroovy> rows = source.get();
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            // data-source hiccup must not unload already-running instances: return
            // an empty index so rows look "extension missing" and are only WARNed
            log.error("Cannot read gw_plugin_groovy rows (dynamic plugins keep previous state): {}", e.toString());
            return List.of();
        }
    }

    private List<PluginJar> safeGetJar(Supplier<List<PluginJar>> source) {
        try {
            List<PluginJar> rows = source.get();
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            log.error("Cannot read gw_plugin_jar rows (dynamic plugins keep previous state): {}", e.toString());
            return List.of();
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
