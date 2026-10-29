package fun.commons.gateway4j.engine.plugin.loader;

import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.control.CompilationFailedException;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.security.AccessControlException;
import java.util.List;
import java.util.Set;

/**
 * Sandbox {@link CompilerConfiguration} factory for user-submitted Groovy plugin
 * scripts (ADR-003: "Groovy 插件运行于沙箱"). Two compile-time layers:
 *
 * <ol>
 *   <li>{@link SecureASTCustomizer}: whitelist of importable classes / star-import
 *       packages, {@code indirectImportCheckEnabled} (every class *used* — notably
 *       every constructor target — must be importable, so {@code new File(...)},
 *       {@code new URL(...)} or {@code Runtime.getRuntime()} fail compilation),
 *       package definitions and dynamic property/method dispatch denied.</li>
 *   <li>{@link SandboxGuardCustomizer}: closes the SecureASTCustomizer blind spots —
 *       constructor bodies and field initializers are NOT visited by the stock
 *       customizer, and Groovy 4 has no method-name whitelist, so dangerous method
 *       names ({@code execute/forName/getRuntime/exit/newInstance/invokeMethod/...})
 *       and dynamic (GString / variable) method or property names are rejected
 *       explicitly.</li>
 * </ol>
 *
 * <p>Scripts are forced into the {@code gw4j.sandbox} package (the code source is
 * named {@code gw4j/sandbox/&lt;name&gt;.groovy}) so the script's own classes can be
 * star-import-whitelisted without opening any real package.</p>
 *
 * <p>Notable contracts for script authors (enforced here): {@code execute(...)} may
 * only be called on a {@code PluginChain} / {@code GatewayPlugin} receiver (never on
 * a {@code String} — that is process execution), {@code println/print} are rejected
 * (data plane must not write to stdout), and the timeout wrapper
 * ({@link TimeoutGuardedPlugin}) bounds wall time at runtime.</p>
 */
public final class GroovySandbox {

    private static final Logger log = LoggerFactory.getLogger(GroovySandbox.class);

    /** Package every sandboxed script is compiled into (see class docs). */
    public static final String SANDBOX_PACKAGE = "gw4j.sandbox";
    /** Source-name prefix that puts the script into {@link #SANDBOX_PACKAGE}. */
    public static final String SANDBOX_SOURCE_PREFIX = "gw4j/sandbox/gw4jScript";

    /** Classes a Groovy plugin script may import (exact FQCNs). */
    public static final List<String> IMPORT_WHITELIST = List.of(
            // java.lang basics (System/Runtime/Thread/ProcessBuilder/Class/ClassLoader
            // deliberately absent — they are reachable via the implicit java.lang import
            // and are exactly what the indirect-import gate must deny)
            "java.lang.String", "java.lang.CharSequence", "java.lang.Object",
            "java.lang.Integer", "java.lang.Long", "java.lang.Double", "java.lang.Float",
            "java.lang.Boolean", "java.lang.Byte", "java.lang.Short", "java.lang.Character",
            "java.lang.Number", "java.lang.Math", "java.lang.StrictMath",
            "java.lang.StringBuilder", "java.lang.StringBuffer", "java.lang.Comparable",
            "java.lang.Iterable", "java.lang.Runnable", "java.lang.Exception",
            "java.lang.RuntimeException", "java.lang.IllegalArgumentException",
            "java.lang.IllegalStateException", "java.lang.UnsupportedOperationException",
            "java.lang.ArithmeticException", "java.lang.NumberFormatException",
            // collections / time
            "java.math.BigDecimal", "java.math.BigInteger",
            "java.util.List", "java.util.Map", "java.util.Set", "java.util.Collection",
            "java.util.ArrayList", "java.util.LinkedList", "java.util.HashMap",
            "java.util.LinkedHashMap", "java.util.HashSet", "java.util.LinkedHashSet",
            "java.util.TreeMap", "java.util.TreeSet", "java.util.Iterator",
            "java.util.Map$Entry", "java.util.Collections", "java.util.Arrays",
            "java.util.Optional", "java.util.Objects", "java.util.UUID",
            "java.util.regex.Pattern", "java.util.regex.Matcher",
            "java.time.Duration", "java.time.Instant", "java.time.LocalDate",
            "java.time.LocalDateTime", "java.time.OffsetDateTime", "java.time.ZoneOffset",
            // groovy
            "groovy.lang.Closure",
            // reactive / web types of the GatewayPlugin signature
            "reactor.core.publisher.Mono", "reactor.core.publisher.Flux",
            "org.springframework.web.server.ServerWebExchange",
            "org.springframework.http.HttpHeaders", "org.springframework.http.HttpStatus",
            "org.springframework.http.MediaType", "org.springframework.http.HttpMethod",
            "org.springframework.http.ResponseCookie",
            "org.springframework.http.server.reactive.ServerHttpRequest",
            "org.springframework.http.server.reactive.ServerHttpResponse",
            "org.springframework.util.StringUtils", "org.springframework.util.AntPathMatcher",
            // the plugin SDK
            "fun.commons.gateway4j.plugin.api.GatewayPlugin",
            "fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin",
            "fun.commons.gateway4j.plugin.api.PluginChain",
            "fun.commons.gateway4j.plugin.api.PluginConfig",
            "fun.commons.gateway4j.plugin.api.PluginContext",
            "fun.commons.gateway4j.plugin.api.PluginResult");

    /**
     * {@code execute(...)} is process execution on {@code String} but delegation on
     * the plugin SDK types — denied everywhere EXCEPT these receivers (plus the
     * sandbox package itself).
     */
    public static final Set<String> EXECUTE_ALLOWED_RECEIVERS = Set.of(
            "fun.commons.gateway4j.plugin.api.PluginChain",
            "fun.commons.gateway4j.plugin.api.GatewayPlugin",
            "fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin",
            "fun.commons.gateway4j.plugin.api.PluginContext");

    /** Method names rejected on ANY receiver (no legitimate gateway-script use). */
    public static final Set<String> DENIED_METHODS = Set.of(
            "exit", "halt", "getRuntime", "forName", "newInstance", "newInstance0",
            "invokeMethod", "evaluate", "parse", "parseClass", "loadClass", "defineClass",
            "getMetaClass", "setMetaClass", "sleep", "getProperty", "setProperty",
            "print", "println", "text", "start");

    /** Property names rejected on ANY receiver (meta-programming / IO / env). */
    public static final Set<String> DENIED_PROPERTIES = Set.of(
            "metaClass", "out", "err", "in", "classLoader", "protectionDomain",
            "runtime", "properties", "class");

    private GroovySandbox() {
    }

    /**
     * Builds a fresh sandboxed configuration. A new instance must be used per
     * compilation (customizers are stateful across compilations).
     */
    public static CompilerConfiguration secureCompilerConfiguration() {
        SecureASTCustomizer secure = new SecureASTCustomizer();
        secure.setImportsWhitelist(IMPORT_WHITELIST);
        // star imports: the script's own (compiler-generated) classes and the plugin
        // SDK package (`import fun.commons.gateway4j.plugin.api.*` is the documented
        // authoring style) — both are fully ours, nothing third-party opens up
        secure.setStarImportsWhitelist(List.of(SANDBOX_PACKAGE,
                "fun.commons.gateway4j.plugin.api"));
        secure.setIndirectImportCheckEnabled(true);
        secure.setPackageAllowed(false);
        secure.setMethodDefinitionAllowed(true);
        secure.setClosuresAllowed(true);
        // no receiversWhiteList here: Groovy 4 dropped the method-name whitelist and
        // exact-receiver matching breaks self-calls on script-defined classes — the
        // import whitelist + indirect check + the guard customizer below cover it.

        CompilerConfiguration config = new CompilerConfiguration();
        config.addCompilationCustomizers(secure, new SandboxGuardCustomizer());
        return config;
    }

    /**
     * Receiver/runtime types that appear in ordinary (safe) Groovy code but are not
     * meaningful as imports: the GString impl (string interpolation) and the closure
     * variable-capture reference. Script-defined classes have NO package (Groovy
     * derives no package from the code-source name), hence the dot-less allowance.
     */
    public static final Set<String> RUNTIME_TYPE_EXTRA_ALLOWED = Set.of(
            "org.codehaus.groovy.runtime.GStringImpl",
            "groovy.lang.Reference",
            "groovy.lang.Closure",
            "[B", "[C", "[I", "[J", "[S", "[Z", "[D", "[F");

    /** True when the class may be named/used inside a sandboxed script. */
    public static boolean isClassAllowed(String className) {
        if (className == null) {
            return false;
        }
        String name = className;
        while (name.startsWith("[")) { // arrays: [Ljava.lang.String;
            name = name.substring(1);
            if (name.startsWith("L") && name.endsWith(";")) {
                name = name.substring(1, name.length() - 1);
            } else {
                // primitive array ([I, [J, ...) — the element is primitive, allow
                return true;
            }
        }
        if (name.indexOf('.') < 0) {
            // default package => a class defined by this very script (no JDK or
            // library class lives in the default package)
            return true;
        }
        if (name.startsWith(SANDBOX_PACKAGE + ".")) {
            return true;
        }
        return IMPORT_WHITELIST.contains(name) || RUNTIME_TYPE_EXTRA_ALLOWED.contains(name);
    }

    /**
     * Compiles {@code script} with the sandbox inside the given loader (all
     * classes of the source become reachable via {@code getLoadedClasses()}).
     * Shared by the loader and the sandbox tests.
     */
    static void compileSandboxed(groovy.lang.GroovyClassLoader loader,
                                 String script, String sourceName)
            throws CompilationFailedException {
        groovy.lang.GroovyCodeSource codeSource =
                new groovy.lang.GroovyCodeSource(script, sourceName, GroovySandbox.SANDBOX_PACKAGE);
        loader.parseClass(codeSource, false);
    }

    /**
     * Uniform sandbox-violation exception: compilation of a user script that
     * touches a forbidden construct fails with this (fail-closed — the plugin is
     * simply not loaded).
     */
    static SecurityException sandboxViolation(String message) {
        log.error("Groovy sandbox violation: {}", message);
        return new AccessControlException(message);
    }

    /** Shared receiver check for {@code execute} (see {@link #EXECUTE_ALLOWED_RECEIVERS}). */
    static boolean isExecuteCallAllowed(String receiverType) {
        if (receiverType == null) {
            return false;
        }
        return receiverType.indexOf('.') < 0
                || receiverType.startsWith(SANDBOX_PACKAGE + ".")
                || EXECUTE_ALLOWED_RECEIVERS.contains(receiverType);
    }

    /** Helper for the guard customizer: unwrap constant text or null when dynamic. */
    static String constantName(Expression expression) {
        if (expression instanceof org.codehaus.groovy.ast.expr.ConstantExpression c) {
            Object value = c.getValue();
            return value instanceof String s ? s : null;
        }
        return null;
    }
}
