package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.PluginJar;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.mock.http.server.reactive.MockServerHttpRequest.get;

/**
 * JAR half of ADR-003 phase 1: binary fixtures (see test resources
 * {@code fixtures/}) — a minimal legal plugin jar (with an SPI descriptor) and
 * an invalid jar without any GatewayPlugin implementation.
 */
class JarPluginLoaderTest {

    private final JarPluginLoader loader = new JarPluginLoader();

    private static Path materializeFixture(String name) throws IOException {
        try (InputStream in = JarPluginLoaderTest.class.getResourceAsStream("/fixtures/" + name)) {
            assertNotNull(in, "fixture missing: " + name);
            Path temp = Files.createTempFile("gw4j-fixture-", "-" + name);
            Files.copy(in, temp, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            return temp;
        }
    }

    private static PluginJar row(Path jar, String mainClass) throws IOException {
        return PluginJar.builder()
                .pluginId(1L)
                .jarPath(jar.toAbsolutePath().toString())
                .jarMd5(JarPluginLoader.md5Hex(Files.readAllBytes(jar)))
                .mainClass(mainClass)
                .build();
    }

    @Test
    void legalJarLoadsViaSpiDescriptorAndExecutes() throws Exception {
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            // main_class empty on purpose: the SPI descriptor must win
            JarPluginHandle handle = loader.load(row(jar, ""));
            try {
                GatewayPlugin plugin = handle.instance();
                assertEquals("jar.demo", plugin.pluginId());
                assertEquals("PRE", plugin.phase());

                MockServerWebExchange exchange = MockServerWebExchange.from(get("/api/x"));
                plugin.execute(exchange, new PluginChain() {
                    @Override
                    public Mono<Void> execute(org.springframework.web.server.ServerWebExchange e) {
                        return Mono.empty();
                    }
                }).block(Duration.ofSeconds(2));
                assertEquals("loaded", exchange.getAttribute("gw4j:jarDemo"));
            } finally {
                handle.close();
            }
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void legalJarLoadsViaMainClassWhenSpiAbsent() throws Exception {
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            // the fixture class lives in the default package, so its FQCN is the bare name
            JarPluginHandle handle = loader.load(row(jar, "DemoGatewayPlugin"));
            assertEquals("jar.demo", handle.instance().pluginId());
            handle.close();
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void spiDescriptorTakesPrecedenceOverStaleMainClass() throws Exception {
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            // resolution order (class docs): META-INF/services first — a stale/bogus
            // main_class on the row must not break a jar with a valid descriptor
            JarPluginHandle handle = loader.load(row(jar, "com.example.DoesNotExist"));
            assertEquals("jar.demo", handle.instance().pluginId());
            handle.close();
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void invalidJarIsRejected() throws Exception {
        Path jar = materializeFixture("invalid-plugin.jar");
        try {
            PluginLoadException e = assertThrows(PluginLoadException.class,
                    () -> loader.load(row(jar, null)));
            assertTrue(e.getMessage().contains("No GatewayPlugin implementation"), e.getMessage());
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void md5MismatchIsRejected() throws Exception {
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            PluginJar tampered = PluginJar.builder()
                    .pluginId(1L)
                    .jarPath(jar.toAbsolutePath().toString())
                    .jarMd5("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                    .mainClass(null)
                    .build();
            PluginLoadException e = assertThrows(PluginLoadException.class, () -> loader.load(tampered));
            assertTrue(e.getMessage().contains("jar_md5 mismatch"), e.getMessage());
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void missingFileIsRejected() {
        PluginLoadException e = assertThrows(PluginLoadException.class,
                () -> loader.load(PluginJar.builder()
                        .pluginId(1L).jarPath("/nonexistent/nope.jar").jarMd5(null).mainClass(null).build()));
        assertTrue(e.getMessage().contains("missing"), e.getMessage());
    }

    @Test
    void handleCloseClosesTheClassloaderExactlyOnce() throws Exception {
        Path jar = materializeFixture("demo-gateway-plugin.jar");
        try {
            JarPluginHandle loaded = loader.load(row(jar, ""));
            AtomicInteger closed = new AtomicInteger();
            URLClassLoader tracked = new URLClassLoader(new java.net.URL[]{jar.toUri().toURL()},
                    JarPluginLoader.class.getClassLoader()) {
                @Override
                public void close() throws IOException {
                    closed.incrementAndGet();
                    super.close();
                }
            };
            JarPluginHandle direct = new JarPluginHandle(tracked, loaded.instance(), jar, "m");
            direct.close();
            assertEquals(1, closed.get(), "classloader.close() must be called exactly once");
            loaded.close();
        } finally {
            Files.deleteIfExists(jar);
        }
    }

    @Test
    void sandboxedParentHidesEngineInternals() {
        SandboxedParentClassLoader parent = new SandboxedParentClassLoader(
                JarPluginLoader.class.getClassLoader(), null);
        assertDoesNotThrow(() -> parent.loadClass(GatewayPlugin.class.getName()));
        assertThrows(ClassNotFoundException.class,
                () -> parent.loadClass(DynamicPluginLoader.class.getName()),
                "engine internals must be invisible to JAR plugins");
        assertThrows(ClassNotFoundException.class,
                () -> parent.loadClass("org.springframework.cloud.gateway.filter.GlobalFilter"));
        assertNull(parent.getResource("fun/commons/gateway4j/engine/plugin/loader/SandboxedParentClassLoader.class"));
        assertNotNull(parent.getResource("fun/commons/gateway4j/plugin/api/GatewayPlugin.class"));
    }
}
