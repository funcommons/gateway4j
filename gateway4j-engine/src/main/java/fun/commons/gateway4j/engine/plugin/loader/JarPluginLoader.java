package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.PluginJar;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Loads one {@code gw_plugin_jar} row into a {@link GatewayPlugin} instance
 * (ADR-003 phase 1, JAR half). The jar file lives in the admin-side upload
 * storage ({@code PluginUploadService}, default {@code gateway4j.plugin.jar-dir}
 * = {@code ./plugins}) — this loader only READS it (admin owns writes).
 *
 * <p>Isolation: a fresh {@link URLClassLoader} per row with the ADR-003 filtered
 * parent ({@link SandboxedParentClassLoader}: plugin-api + common + the web/reactor
 * signature types only). Validation (fail-closed, ERROR + skip on failure):
 *
 * <ol>
 *   <li>file must exist and its bytes' MD5 must match {@code jar_md5};</li>
 *   <li>SPI resolution of the plugin class, in order: {@code META-INF/services/
 *       fun.commons.gateway4j.plugin.api.GatewayPlugin} → the row's
 *       {@code main_class} → full class-entry scan (mirrors the admin
 *       upload-time detection);</li>
 *   <li>the resolved class must be a concrete {@link GatewayPlugin} implementation
 *       with a no-arg constructor.</li>
 * </ol>
 */
public class JarPluginLoader {

    private static final Logger log = LoggerFactory.getLogger(JarPluginLoader.class);

    /** Service-loader descriptor inside plugin jars (optional but authoritative). */
    public static final String SPI_RESOURCE = "META-INF/services/"
            + GatewayPlugin.class.getName();

    private final List<String> extraParentPackages;

    public JarPluginLoader() {
        this(null);
    }

    public JarPluginLoader(List<String> extraParentPackages) {
        this.extraParentPackages = extraParentPackages;
    }

    public JarPluginHandle load(PluginJar row) throws PluginLoadException {
        if (row == null || row.getJarPath() == null || row.getJarPath().isBlank()) {
            throw new PluginLoadException("jar_path is empty");
        }
        Path jarPath = Path.of(row.getJarPath());
        if (!Files.isRegularFile(jarPath)) {
            throw new PluginLoadException("jar file missing: " + jarPath);
        }
        byte[] jarBytes;
        try {
            jarBytes = Files.readAllBytes(jarPath);
        } catch (IOException e) {
            throw new PluginLoadException("jar file unreadable: " + jarPath + ": " + e.getMessage(), e);
        }
        if (row.getJarMd5() != null && !row.getJarMd5().isBlank()) {
            String actual = md5Hex(jarBytes);
            if (!actual.equalsIgnoreCase(row.getJarMd5().trim())) {
                throw new PluginLoadException("jar_md5 mismatch for " + jarPath
                        + " (expected " + row.getJarMd5() + ", computed " + actual + ")");
            }
        }

        URLClassLoader classLoader = new URLClassLoader(
                new URL[]{uncheckedToUrl(jarPath)},
                new SandboxedParentClassLoader(JarPluginLoader.class.getClassLoader(), extraParentPackages));
        boolean success = false;
        try {
            String className = resolvePluginClassName(classLoader, jarPath, row);
            if (className == null) {
                throw new PluginLoadException("No GatewayPlugin implementation found in " + jarPath
                        + " (no META-INF/services descriptor, no usable main_class, no implementing class)");
            }
            Class<?> pluginClass = loadConcrete(classLoader, className);
            if (!GatewayPlugin.class.isAssignableFrom(pluginClass)) {
                throw new PluginLoadException("Class " + className + " does not implement GatewayPlugin");
            }
            GatewayPlugin instance = instantiate(pluginClass);
            success = true;
            log.info("JAR plugin loaded: file={} class={} main_class={}", jarPath.getFileName(),
                    className, row.getMainClass());
            return new JarPluginHandle(classLoader, instance, jarPath, row.getJarMd5());
        } finally {
            if (!success) {
                try {
                    classLoader.close();
                } catch (IOException ignored) {
                    // failed load: just release the classloader early
                }
            }
        }
    }

    /**
     * SPI order (see class docs). Errors while resolving a *nominated* class are
     * fatal; a silent class-scan is the last resort for jars without a descriptor.
     */
    private String resolvePluginClassName(URLClassLoader classLoader, Path jarPath,
                                          PluginJar row) throws PluginLoadException {
        Optional<String> viaSpi = readSpiDescriptor(classLoader);
        if (viaSpi.isPresent()) {
            return viaSpi.get();
        }
        if (row.getMainClass() != null && !row.getMainClass().isBlank()) {
            return row.getMainClass().trim();
        }
        return scanForImplementation(jarPath);
    }

    private Optional<String> readSpiDescriptor(URLClassLoader classLoader) {
        try (InputStream in = classLoader.getResourceAsStream(SPI_RESOURCE)) {
            if (in == null) {
                return Optional.empty();
            }
            String body = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            return body.lines()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .findFirst();
        } catch (IOException e) {
            log.warn("Cannot read SPI descriptor from plugin jar: {}", e.toString());
            return Optional.empty();
        }
    }

    /** Mirrors admin PluginUploadService.detectMainClass: first concrete GatewayPlugin class entry. */
    private String scanForImplementation(Path jarPath) {
        try (JarFile jarFile = new JarFile(jarPath.toFile())) {
            List<String> classNames = jarFile.stream()
                    .map(JarEntry::getName)
                    .filter(n -> n.endsWith(".class") && !n.contains("$"))
                    .map(n -> n.replace('/', '.').substring(0, n.length() - 6))
                    .toList();
            for (String className : classNames) {
                try (URLClassLoader probe = new URLClassLoader(
                        new URL[]{jarPath.toUri().toURL()}, JarPluginLoader.class.getClassLoader())) {
                    Class<?> clazz = Class.forName(className, false, probe);
                    if (GatewayPlugin.class.isAssignableFrom(clazz)
                            && !clazz.isInterface()
                            && !Modifier.isAbstract(clazz.getModifiers())) {
                        return className;
                    }
                } catch (Throwable ignored) {
                    // not a plugin class — keep scanning
                }
            }
            return null;
        } catch (IOException e) {
            log.warn("Cannot scan plugin jar {}: {}", jarPath, e.toString());
            return null;
        }
    }

    private Class<?> loadConcrete(URLClassLoader classLoader, String className)
            throws PluginLoadException {
        Class<?> clazz;
        try {
            clazz = Class.forName(className, false, classLoader);
        } catch (Throwable e) {
            throw new PluginLoadException("Plugin class '" + className + "' cannot be loaded "
                    + "(sandboxed parent refuses engine-internal dependencies?): " + e.toString(), e);
        }
        if (clazz.isInterface() || Modifier.isAbstract(clazz.getModifiers())) {
            throw new PluginLoadException("Plugin class '" + className + "' is not concrete");
        }
        return clazz;
    }

    private GatewayPlugin instantiate(Class<?> pluginClass) throws PluginLoadException {
        try {
            return (GatewayPlugin) pluginClass.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new PluginLoadException("Cannot instantiate plugin class "
                    + pluginClass.getName() + " (a public no-arg constructor is required): "
                    + e.toString(), e);
        }
    }

    private static java.net.URL uncheckedToUrl(Path path) {
        try {
            return path.toUri().toURL();
        } catch (java.net.MalformedURLException e) {
            throw new IllegalStateException("Invalid jar path " + path, e);
        }
    }

    /** Lowercase-hex MD5 over raw bytes (integrity convention for jar_md5). */
    static String md5Hex(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException("MD5 unavailable", e);
        }
    }
}
