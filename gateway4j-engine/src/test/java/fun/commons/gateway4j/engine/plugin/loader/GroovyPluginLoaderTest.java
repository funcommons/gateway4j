package fun.commons.gateway4j.engine.plugin.loader;

import fun.commons.gateway4j.common.model.PluginGroovy;
import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.mock.http.server.reactive.MockServerHttpRequest.get;

/**
 * End-to-end Groovy row → compiled instance behavior (data-plane contract),
 * plus the fail-closed integrity / compile-failure / no-plugin-class paths.
 */
class GroovyPluginLoaderTest {

    private final GroovyPluginLoader loader = new GroovyPluginLoader();

    private static PluginGroovy row(String content, String md5) {
        return PluginGroovy.builder()
                .pluginId(1L)
                .scriptContent(content)
                .scriptMd5(md5)
                .build();
    }

    @Test
    void legitScriptExecutesOnTheDataPlane() throws Exception {
        GroovyPluginHandle handle = loader.load(
                row(LoaderTestFixtures.LEGIT_SCRIPT, LoaderTestFixtures.LEGIT_SCRIPT_MD5));
        try {
            GatewayPlugin plugin = handle.instance();
            assertEquals("groovy.echo", plugin.pluginId());
            assertEquals("PRE", plugin.phase());

            MockServerWebExchange exchange = MockServerWebExchange.from(get("/api/x").header("X-Demo", "abc"));
            Mono<Void> done = plugin.execute(exchange, new PluginChain() {
                @Override
                public Mono<Void> execute(org.springframework.web.server.ServerWebExchange e) {
                    return Mono.empty();
                }
            });
            done.block(java.time.Duration.ofSeconds(2));

            assertEquals("ABC", exchange.getAttribute("gw4j:groovyEcho"));
        } finally {
            handle.close();
        }
    }

    @Test
    void md5MismatchIsRejected() {
        PluginLoadException e = assertThrows(PluginLoadException.class, () -> loader.load(
                row(LoaderTestFixtures.LEGIT_SCRIPT, "deadbeefdeadbeefdeadbeefdeadbeef")));
        assertTrue(e.getMessage().contains("md5 mismatch"), e.getMessage());
    }

    @Test
    void compileFailureIsRejected() {
        assertThrows(PluginLoadException.class, () -> loader.load(
                row("class Broken { def x( {", null)));
    }

    @Test
    void sandboxViolationIsRejected() throws Exception {
        String evil = """
                import fun.commons.gateway4j.plugin.api.*
                import org.springframework.web.server.ServerWebExchange
                import reactor.core.publisher.Mono

                class EvilPlugin implements GatewayPlugin {
                    String pluginId() { 'groovy.evil' }
                    String pluginName() { 'evil' }
                    String phase() { 'PRE' }
                    int order() { 0 }
                    Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                        "ls".execute()
                        return chain.execute(exchange)
                    }
                }
                """;
        PluginLoadException e = assertThrows(PluginLoadException.class,
                () -> loader.load(row(evil, GroovyPluginLoader.md5Hex(evil))));
        assertTrue(e.getMessage().toLowerCase().contains("compilation failed"), e.getMessage());
    }

    @Test
    void scriptWithoutGatewayPluginClassIsRejected() {
        String noPlugin = """
                class JustHelper {
                    String hello() { 'hi' }
                }
                """;
        PluginLoadException e = assertThrows(PluginLoadException.class,
                () -> loader.load(row(noPlugin, null)));
        assertTrue(e.getMessage().contains("no concrete class implementing GatewayPlugin"), e.getMessage());
    }

    @Test
    void blankScriptIsRejected() {
        assertThrows(PluginLoadException.class, () -> loader.load(row("   ", null)));
    }
}
