package fun.commons.gateway4j.plugin.builtins.basicauth;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class BasicAuthPluginTest {

    private BasicAuthPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new BasicAuthPlugin();
    }

    private MockServerWebExchange createExchange(String... headers) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get("/test");
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        return MockServerWebExchange.builder(builder.build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    private PluginChain capturingChain(AtomicReference<org.springframework.web.server.ServerWebExchange> captured) {
        return exchange -> { captured.set(exchange); return Mono.empty(); };
    }

    private String basicAuth(String user, String pass) {
        return "Basic " + Base64.getEncoder().encodeToString((user + ":" + pass).getBytes());
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void missingAuthHeaderReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals("Basic realm=\"Gateway\"", exchange.getResponse().getHeaders().getFirst("WWW-Authenticate"));
    }

    @Test
    void validCredentialsPass() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange("Authorization", basicAuth("admin", "password123"));
        AtomicReference<org.springframework.web.server.ServerWebExchange> captured = new AtomicReference<>();
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertEquals("admin", captured.get().getRequest().getHeaders().getFirst("X-User"));
    }

    @Test
    void wrongPasswordReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange("Authorization", basicAuth("admin", "wrong"));
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void unknownUserReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange("Authorization", basicAuth("unknown", "password123"));
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void invalidBase64ReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange("Authorization", "Basic !!!invalid!!!");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void nonBasicAuthHeaderReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("basic-auth",
                "{\"accounts\":{\"admin\":\"password123\"}}", 1));

        MockServerWebExchange exchange = createExchange("Authorization", "Bearer some-token");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void emptyAccountsPassesThrough() {
        plugin.onConfigChange(new PluginConfig("basic-auth", "{\"accounts\":{}}", 1));

        MockServerWebExchange exchange = createExchange();
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("basic-auth", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
