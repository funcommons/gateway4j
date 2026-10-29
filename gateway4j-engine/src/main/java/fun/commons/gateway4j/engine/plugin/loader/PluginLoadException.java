package fun.commons.gateway4j.engine.plugin.loader;

/**
 * Thrown when a dynamic plugin (GROOVY script / uploaded JAR) fails sandbox
 * compilation, integrity (MD5) or SPI validation. Fail-closed: the row is
 * skipped by the {@link DynamicPluginLoader} (no instance registered) and the
 * data plane counts it as {@code skipped} per request.
 */
public class PluginLoadException extends Exception {

    public PluginLoadException(String message) {
        super(message);
    }

    public PluginLoadException(String message, Throwable cause) {
        super(message, cause);
    }
}
