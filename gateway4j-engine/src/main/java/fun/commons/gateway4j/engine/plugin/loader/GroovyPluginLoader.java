package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.PluginGroovy;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import groovy.lang.GroovyClassLoader;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.CompilationFailedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

/**
 * Compiles one {@code gw_plugin_groovy} row into a {@link GatewayPlugin} instance
 * (ADR-003 phase 1, GROOVY half).
 *
 * <p>Contract: the {@code script_content} declares (at least) one concrete class
 * implementing {@link GatewayPlugin} (plugin-api) with a no-arg constructor — the
 * same contract the JAR half validates via SPI/{@code main_class}. The first such
 * class wins. Compilation runs inside the {@link GroovySandbox}; a sandbox or
 * compile violation, an MD5 mismatch or a missing plugin class all fail with
 * {@link PluginLoadException} (fail-closed, the row is skipped).</p>
 *
 * <p>Integrity convention: {@code script_md5} = lowercase-hex MD5 over the UTF-8
 * bytes of {@code script_content} (same convention as the JAR half over file
 * bytes). Rows without a blank {@code script_md5} are loaded without integrity
 * check (the column is admin-side written).</p>
 */
public class GroovyPluginLoader {

    private static final Logger log = LoggerFactory.getLogger(GroovyPluginLoader.class);

    /** Lowercase-hex MD5 over UTF-8 bytes (integrity convention for script_md5). */
    public static String md5Hex(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            return HexFormat.of().formatHex(
                    digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("MD5 unavailable", e);
        }
    }

    /**
     * @param row the extension row; only {@code scriptContent} / {@code scriptMd5} /
     *            {@code compileStatus} are read here (ENABLED gating is the
     *            coordinator's job)
     */
    public GroovyPluginHandle load(PluginGroovy row) throws PluginLoadException {
        if (row == null || row.getScriptContent() == null || row.getScriptContent().isBlank()) {
            throw new PluginLoadException("script_content is empty");
        }
        String content = row.getScriptContent();
        if (row.getScriptMd5() != null && !row.getScriptMd5().isBlank()) {
            String actual = md5Hex(content);
            if (!actual.equalsIgnoreCase(row.getScriptMd5().trim())) {
                throw new PluginLoadException("script_md5 mismatch: expected " + row.getScriptMd5()
                        + ", computed " + actual + " (script tampered or stale row)");
            }
        }

        // fresh, non-shared classloader per script: closed (via the handle) when the
        // script changes or the row is removed — the ADR-003 Metaspace guard
        GroovyClassLoader classLoader = new GroovyClassLoader(
                GroovyPluginLoader.class.getClassLoader(), GroovySandbox.secureCompilerConfiguration());
        boolean success = false;
        try {
            String sourceName = GroovySandbox.SANDBOX_SOURCE_PREFIX + "_" + Integer.toHexString(
                    content.hashCode()) + ".groovy";
            List<Class<?>> classes;
            try {
                GroovySandbox.compileSandboxed(classLoader, content, sourceName);
                classes = java.util.Arrays.asList(classLoader.getLoadedClasses());
            } catch (CompilationFailedException e) {
                throw new PluginLoadException("Groovy script compilation failed (sandbox): "
                        + firstLine(e.getMessage()), e);
            }

            Class<?> pluginClass = findGatewayPluginImpl(classes);
            if (pluginClass == null) {
                throw new PluginLoadException(
                        "Script defines no concrete class implementing GatewayPlugin (plugin-api)");
            }
            GatewayPlugin instance = instantiate(pluginClass);
            success = true;
            log.info("Groovy plugin compiled: class={} script_md5={}", pluginClass.getName(),
                    row.getScriptMd5());
            return new GroovyPluginHandle(classLoader, instance, row.getScriptMd5());
        } finally {
            if (!success) {
                try {
                    classLoader.close();
                } catch (Exception ignored) {
                    // failed compile: just release the classloader early
                }
            }
        }
    }

    private Class<?> findGatewayPluginImpl(List<Class<?>> classes) {
        for (Class<?> clazz : classes) {
            if (GatewayPlugin.class.isAssignableFrom(clazz)
                    && !clazz.isInterface()
                    && !Modifier.isAbstract(clazz.getModifiers())) {
                return clazz;
            }
        }
        return null;
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

    private static String firstLine(String message) {
        if (message == null) {
            return "";
        }
        return message.lines().findFirst().orElse("").trim();
    }
}
