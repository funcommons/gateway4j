package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URLClassLoader;
import java.nio.file.Path;

/**
 * A loaded JAR plugin: its isolated {@link URLClassLoader} (ADR-003: one
 * independent classloader per JAR, parent exposes only the plugin SDK — see
 * {@link SandboxedParentClassLoader}) plus the instantiated {@link GatewayPlugin}.
 *
 * <p>Lifecycle owned by {@link DynamicPluginLoader}: on jar change or row removal
 * the old handle is closed BEFORE the new one is built. Close calls
 * {@code onDestroy()} first (the ADR-mandated cleanup hook for plugins that
 * started threads), then {@link URLClassLoader#close()} so the jar file can be
 * replaced/deleted and classes can be collected.</p>
 */
public final class JarPluginHandle implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(JarPluginHandle.class);

    private final URLClassLoader classLoader;
    private final GatewayPlugin instance;
    private final Path jarPath;
    private final String jarMd5;

    public JarPluginHandle(URLClassLoader classLoader, GatewayPlugin instance,
                           Path jarPath, String jarMd5) {
        this.classLoader = classLoader;
        this.instance = instance;
        this.jarPath = jarPath;
        this.jarMd5 = jarMd5;
    }

    public GatewayPlugin instance() {
        return instance;
    }

    public Path jarPath() {
        return jarPath;
    }

    public String jarMd5() {
        return jarMd5;
    }

    @Override
    public void close() {
        try {
            instance.onDestroy();
        } catch (Exception e) {
            log.warn("JAR plugin {} onDestroy failed (ignored): {}", instance.pluginId(), e.toString());
        }
        try {
            classLoader.close();
        } catch (IOException e) {
            log.warn("JAR classloader close failed for plugin {}: {}", instance.pluginId(), e.toString());
        }
    }
}
