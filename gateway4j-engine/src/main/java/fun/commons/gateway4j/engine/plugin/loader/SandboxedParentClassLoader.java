package fun.commons.gateway4j.engine.plugin.loader;

import java.util.List;

/**
 * The ADR-003 "parent classloader only loads plugin-api + common" for uploaded
 * JAR plugins: an explicitly whitelisted view over the engine's application
 * classloader. Class/resource names outside the whitelist are refused
 * ({@link ClassNotFoundException} / {@code null}), so a JAR plugin cannot see —
 * let alone call — engine internals (dispatch, config, registry, framework4j,
 * datasource/redis stacks). Plugin classes themselves are loaded by the child
 * {@link java.net.URLClassLoader} (the parent refuses them first).
 *
 * <p>Always visible: JDK packages ({@code java.*}, {@code javax.*}, ...), the
 * plugin SDK ({@code fun.commons.gateway4j.plugin.api.*}), common entities,
 * the Spring Web/HTTP types of the {@code GatewayPlugin} signature, Reactor,
 * ReactivesStreams and SLF4J. Deployments can widen the view (carefully) via
 * {@code gateway4j.engine.plugin-loader.jar-parent-packages}.</p>
 */
public class SandboxedParentClassLoader extends ClassLoader {

    /** Base whitelist (package prefixes) — keep in sync with ADR-003. */
    public static final List<String> DEFAULT_PACKAGE_PREFIXES = List.of(
            "fun.commons.gateway4j.plugin.api.",
            "fun.commons.gateway4j.common.",
            "org.springframework.lang.",
            "org.springframework.core.",
            "org.springframework.util.",
            "org.springframework.http.",
            "org.springframework.web.",
            "reactor.core.",
            "reactor.util.",
            "org.reactivestreams.",
            "org.slf4j.");

    private static final List<String> JDK_PREFIXES = List.of(
            "java.", "javax.", "jdk.", "sun.", "com.sun.", "org.ietf.",
            "org.ietf.jgss.", "org.w3c.", "org.xml.");

    private final List<String> allowedPrefixes;

    public SandboxedParentClassLoader(ClassLoader parent, List<String> extraPackagePrefixes) {
        super(parent);
        this.allowedPrefixes = extraPackagePrefixes == null || extraPackagePrefixes.isEmpty()
                ? DEFAULT_PACKAGE_PREFIXES
                : List.copyOf(extraPackagePrefixes).stream()
                        .map(p -> p.endsWith(".") ? p : p + ".")
                        .toList();
    }

    public boolean isAllowed(String name) {
        if (name == null) {
            return false;
        }
        for (String prefix : JDK_PREFIXES) {
            if (name.startsWith(prefix)) {
                return true;
            }
        }
        for (String prefix : allowedPrefixes) {
            if (name.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (isAllowed(name)) {
            return super.loadClass(name, resolve);
        }
        throw new ClassNotFoundException(
                "Plugin sandbox: class '" + name + "' is not visible to JAR plugins (ADR-003)");
    }

    @Override
    public java.net.URL getResource(String name) {
        if (isAllowedResource(name)) {
            return super.getResource(name);
        }
        return null;
    }

    @Override
    public java.util.Enumeration<java.net.URL> getResources(String name) throws java.io.IOException {
        if (isAllowedResource(name)) {
            return super.getResources(name);
        }
        return java.util.Collections.emptyEnumeration();
    }

    private boolean isAllowedResource(String resourceName) {
        if (resourceName == null) {
            return false;
        }
        String className = resourceName;
        if (className.endsWith(".class")) {
            className = className.substring(0, className.length() - 6)
                    .replace('/', '.');
        }
        return isAllowed(className);
    }
}
