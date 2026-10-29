package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.PluginGroovy;
import fun.commons.gateway4j.common.model.PluginJar;
import fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import groovy.lang.GroovyClassLoader;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.mock.http.server.reactive.MockServerHttpRequest.get;

/**
 * Coordinator contract: ENABLED-only loading, compile-failure → skipped (no
 * registration), script-change → old ClassLoader closed BEFORE the new one is
 * built (ADR-003 Metaspace guard), row removal → unregister + close,
 * timeout → exception into the existing chain semantics.
 */
class DynamicPluginLoaderTest {

    private static Plugin groovyRow(long id, String pluginId, String status) {
        return Plugin.builder().id(id).pluginId(pluginId).pluginName(pluginId)
                .pluginType("GROOVY").pluginPhase("PRE").scope("GLOBAL")
                .status(status).sortOrder(0).config("{}").configVersion(1L).build();
    }

    private static Plugin jarPluginRow(long id, String pluginId) {
        return Plugin.builder().id(id).pluginId(pluginId).pluginName(pluginId)
                .pluginType("JAR").pluginPhase("PRE").scope("ROUTE")
                .status("ENABLED").sortOrder(0).config("{}").build();
    }

    private static PluginGroovy scriptRow(long id, String content, String md5) {
        return PluginGroovy.builder().pluginId(id).scriptContent(content).scriptMd5(md5).build();
    }

    private static PluginJar jarRow(long id, Path jarPath, String md5) throws IOException {
        return PluginJar.builder().pluginId(id).jarPath(jarPath.toAbsolutePath().toString())
                .jarMd5(md5).mainClass(null).build();
    }

    private static Path materializeFixture(String name) throws IOException {
        try (InputStream in = DynamicPluginLoaderTest.class.getResourceAsStream("/fixtures/" + name)) {
            assertNotNull(in, "fixture missing: " + name);
            Path temp = Files.createTempFile("gw4j-dyn-", "-" + name);
            Files.copy(in, temp, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            return temp;
        }
    }

    /** Groovy loader whose handles close a COUNTING classloader (close visibility). */
    private static GroovyPluginLoader closeTrackingLoader(AtomicInteger closeCount) {
        return new GroovyPluginLoader() {
            @Override
            public GroovyPluginHandle load(PluginGroovy row) throws PluginLoadException {
                GroovyPluginHandle real = super.load(row);
                return new GroovyPluginHandle(new GroovyClassLoader() {
                    @Override
                    public void close() {
                        closeCount.incrementAndGet();
                    }
                }, real.instance(), real.scriptMd5());
            }
        };
    }

    @Test
    void enabledGroovyRowIsLoadedAndRegistered() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                new GroovyPluginLoader(), new JarPluginLoader(),
                () -> List.of(scriptRow(7L, LoaderTestFixtures.LEGIT_SCRIPT,
                        LoaderTestFixtures.LEGIT_SCRIPT_MD5)),
                List::of,
                Duration.ofMillis(1000));

        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(7L, "groovy.echo", "ENABLED")), 1L));

        GatewayPlugin instance = registry.find("groovy.echo");
        assertNotNull(instance, "ENABLED GROOVY row must get a runtime instance");
        assertEquals("groovy.echo", instance.pluginId(), "row plugin_id wins over script id");
        assertEquals(1, loader.activeCount());
    }

    @Test
    void disabledRowIsNeverLoaded() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                new GroovyPluginLoader(), new JarPluginLoader(),
                () -> List.of(scriptRow(7L, LoaderTestFixtures.LEGIT_SCRIPT,
                        LoaderTestFixtures.LEGIT_SCRIPT_MD5)),
                List::of,
                Duration.ofMillis(1000));

        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(7L, "groovy.echo", "DISABLED")), 1L));

        assertNull(registry.find("groovy.echo"), "只有 ENABLED 才装载");
        assertEquals(0, loader.activeCount());
    }

    @Test
    void compileFailureIsSkippedNotFatal() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        String broken = "class Broken { def x( {";
        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                new GroovyPluginLoader(), new JarPluginLoader(),
                () -> List.of(scriptRow(8L, broken, GroovyPluginLoader.md5Hex(broken))),
                List::of,
                Duration.ofMillis(1000));

        assertDoesNotThrow(() -> loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(8L, "groovy.broken", "ENABLED")), 1L)));

        assertNull(registry.find("groovy.broken"),
                "compile failure must leave the id unregistered (data plane counts skipped)");
    }

    @Test
    void unchangedScriptIsNotRecompiled() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        AtomicInteger compiles = new AtomicInteger();
        GroovyPluginLoader counting = new GroovyPluginLoader() {
            @Override
            public GroovyPluginHandle load(PluginGroovy row) throws PluginLoadException {
                compiles.incrementAndGet();
                return super.load(row);
            }
        };
        DynamicPluginLoader loader = new DynamicPluginLoader(registry, counting, new JarPluginLoader(),
                () -> List.of(scriptRow(7L, LoaderTestFixtures.LEGIT_SCRIPT,
                        LoaderTestFixtures.LEGIT_SCRIPT_MD5)),
                List::of, Duration.ofMillis(1000));

        ConfigLoadedEvent event = new ConfigLoadedEvent(this,
                List.of(groovyRow(7L, "groovy.echo", "ENABLED")), 1L);
        loader.onConfigLoaded(event);
        loader.onConfigLoaded(event);
        assertEquals(1, compiles.get(), "same script_md5 must reuse the compiled instance");
        assertNotNull(registry.find("groovy.echo"));
    }

    @Test
    void scriptChangeClosesOldClassloaderThenLoadsNew() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        AtomicInteger closeCount = new AtomicInteger();
        CopyOnWriteArrayList<PluginGroovy> current = new CopyOnWriteArrayList<>();
        current.add(scriptRow(9L, LoaderTestFixtures.LEGIT_SCRIPT, LoaderTestFixtures.LEGIT_SCRIPT_MD5));

        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                closeTrackingLoader(closeCount), new JarPluginLoader(),
                () -> List.copyOf(current), List::of, Duration.ofMillis(1000));

        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(9L, "groovy.echo", "ENABLED")), 1L));
        assertNotNull(registry.find("groovy.echo"));
        assertEquals(0, closeCount.get(), "no close before any change");

        // script content changes (same row id, new md5) → old classloader MUST close
        String v2 = LoaderTestFixtures.LEGIT_SCRIPT.replace("X-Demo", "X-Demo2");
        current.set(0, scriptRow(9L, v2, GroovyPluginLoader.md5Hex(v2)));
        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(9L, "groovy.echo", "ENABLED")), 2L));
        assertNotNull(registry.find("groovy.echo"), "replacement instance registered");
        assertEquals(1, closeCount.get(), "old ClassLoader must be closed exactly once on script change");
    }

    @Test
    void removedRowIsUnregistered() throws Exception {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            List<PluginJar> jarSource = List.of(
                    jarRow(11L, jar, JarPluginLoader.md5Hex(Files.readAllBytes(jar))));
            DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                    new GroovyPluginLoader(), new JarPluginLoader(),
                    List::of,
                    () -> jarSource,
                    Duration.ofMillis(1000));

            loader.onConfigLoaded(new ConfigLoadedEvent(this,
                    List.of(jarPluginRow(11L, "jar.demo")), 1L));
            assertNotNull(registry.find("jar.demo"));

            // row disappears from the snapshot → unregister + handle close
            loader.onConfigLoaded(new ConfigLoadedEvent(this, List.of(), 2L));
            assertNull(registry.find("jar.demo"), "removed row must be unregistered");
            assertEquals(0, loader.activeCount());
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void disabledRowUnloadsAPreviouslyRunningInstance() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        AtomicInteger closeCount = new AtomicInteger();
        CopyOnWriteArrayList<Plugin> rows = new CopyOnWriteArrayList<>();
        rows.add(groovyRow(9L, "groovy.echo", "ENABLED"));

        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                closeTrackingLoader(closeCount), new JarPluginLoader(),
                () -> List.of(scriptRow(9L, LoaderTestFixtures.LEGIT_SCRIPT,
                        LoaderTestFixtures.LEGIT_SCRIPT_MD5)),
                List::of, Duration.ofMillis(1000));

        loader.onConfigLoaded(new ConfigLoadedEvent(this, List.copyOf(rows), 1L));
        assertNotNull(registry.find("groovy.echo"));

        rows.set(0, groovyRow(9L, "groovy.echo", "DISABLED"));
        loader.onConfigLoaded(new ConfigLoadedEvent(this, List.copyOf(rows), 2L));
        assertNull(registry.find("groovy.echo"), "disabling must unload");
        assertEquals(1, closeCount.get(), "unloading closes the classloader");
    }

    @Test
    void jarRowLoadsThroughCoordinator() throws Exception {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            List<PluginJar> jarSource = List.of(
                    jarRow(11L, jar, JarPluginLoader.md5Hex(Files.readAllBytes(jar))));
            DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                    new GroovyPluginLoader(), new JarPluginLoader(),
                    List::of,
                    () -> jarSource,
                    Duration.ofMillis(1000));

            loader.onConfigLoaded(new ConfigLoadedEvent(this,
                    List.of(jarPluginRow(11L, "jar.demo")), 1L));

            GatewayPlugin instance = registry.find("jar.demo");
            assertNotNull(instance);
            MockServerWebExchange exchange = MockServerWebExchange.from(get("/api/x"));
            instance.execute(exchange, e -> Mono.empty()).block(Duration.ofSeconds(2));
            assertEquals("loaded", exchange.getAttribute("gw4j:jarDemo"));
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void extensionRowMissingOnlyWarnsAndSkips() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                new GroovyPluginLoader(), new JarPluginLoader(),
                List::of, List::of, Duration.ofMillis(1000));

        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(20L, "groovy.norow", "ENABLED")), 1L));
        assertNull(registry.find("groovy.norow"));
    }

    @Test
    void timeoutThrowsIntoTheChain() {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();
        String slowScript = """
                import fun.commons.gateway4j.plugin.api.*
                import org.springframework.web.server.ServerWebExchange
                import reactor.core.publisher.Mono

                class SlowPlugin implements GatewayPlugin {
                    String pluginId() { 'groovy.slow' }
                    String pluginName() { 'slow' }
                    String phase() { 'PRE' }
                    int order() { 0 }
                    Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                        return Mono.never()
                    }
                }
                """;
        DynamicPluginLoader loader = new DynamicPluginLoader(registry,
                new GroovyPluginLoader(), new JarPluginLoader(),
                () -> List.of(scriptRow(12L, slowScript, GroovyPluginLoader.md5Hex(slowScript))),
                List::of,
                Duration.ofMillis(80));

        loader.onConfigLoaded(new ConfigLoadedEvent(this,
                List.of(groovyRow(12L, "groovy.slow", "ENABLED")), 1L));
        GatewayPlugin instance = registry.find("groovy.slow");
        assertNotNull(instance);

        MockServerWebExchange exchange = MockServerWebExchange.from(get("/api/x"));
        IllegalStateException timeout = assertThrows(IllegalStateException.class,
                () -> instance.execute(exchange, e -> Mono.empty()).block(Duration.ofSeconds(2)));
        assertTrue(timeout.getMessage().contains("timed out"), timeout.getMessage());
        Throwable cause = timeout.getCause();
        assertTrue(cause instanceof TimeoutException
                        || (cause != null && cause.getCause() instanceof TimeoutException),
                "timeout cause expected, got " + timeout);
    }
}
