package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import groovy.lang.GroovyClassLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

/**
 * A loaded Groovy plugin: the script's {@link GroovyClassLoader} (kept open for
 * the instance's lifetime — closing it early would break lazily-resolved
 * classes) plus the compiled {@link GatewayPlugin} instance.
 *
 * <p>Lifecycle is owned by {@link DynamicPluginLoader}: on script change or row
 * removal the OLD handle is closed BEFORE a new one is built (close → compile →
 * register), which is the Metaspace-leak guard of ADR-003. Close first calls the
 * plugin's {@code onDestroy()} (the ADR-mandated cleanup hook), then closes the
 * classloader.</p>
 */
public final class GroovyPluginHandle implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(GroovyPluginHandle.class);

    private final GroovyClassLoader classLoader;
    private final GatewayPlugin instance;
    private final String scriptMd5;

    public GroovyPluginHandle(GroovyClassLoader classLoader, GatewayPlugin instance, String scriptMd5) {
        this.classLoader = classLoader;
        this.instance = instance;
        this.scriptMd5 = scriptMd5;
    }

    public GatewayPlugin instance() {
        return instance;
    }

    public String scriptMd5() {
        return scriptMd5;
    }

    @Override
    public void close() {
        try {
            instance.onDestroy();
        } catch (Exception e) {
            log.warn("Groovy plugin {} onDestroy failed (ignored): {}", instance.pluginId(), e.toString());
        }
        try {
            classLoader.close();
        } catch (IOException e) {
            log.warn("Groovy classloader close failed for plugin {}: {}",
                    instance.pluginId(), e.toString());
        }
    }
}
