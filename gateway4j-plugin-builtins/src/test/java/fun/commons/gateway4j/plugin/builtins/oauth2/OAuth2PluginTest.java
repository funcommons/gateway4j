package fun.commons.gateway4j.plugin.builtins.oauth2;

import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class OAuth2PluginTest {

    private OAuth2Plugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new OAuth2Plugin();
    }

    private MockServerWebExchange createExchange(String path, String... headers) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        for (int i = 0; i < headers.length; i += 2) {
            builder.header(headers[i], headers[i + 1]);
        }
        return MockServerWebExchange.builder(builder.build()).build();
    }

    private PluginChain passThroughChain() {
        return exchange -> Mono.empty();
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
    }

    @Test
    void noTokenRedirectsToAuthServer() {
        plugin.onConfigChange(new PluginConfig("oauth2",
                "{\"clientId\":\"test-client\",\"authorizationUri\":\"https://auth.example.com/authorize\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
        String location = exchange.getResponse().getHeaders().getFirst("Location");
        assertNotNull(location);
        assertTrue(location.contains("client_id=test-client"));
        assertTrue(location.contains("response_type=code"));
    }

    @Test
    void bearerTokenPassesThrough() {
        plugin.onConfigChange(new PluginConfig("oauth2",
                "{\"clientId\":\"test-client\",\"authorizationUri\":\"https://auth.example.com/authorize\"}", 1));

        MockServerWebExchange exchange = createExchange("/test", "Authorization", "Bearer some-token");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.FOUND, exchange.getResponse().getStatusCode());
    }

    @Test
    void customTokenHeader() {
        plugin.onConfigChange(new PluginConfig("oauth2",
                "{\"clientId\":\"test-client\",\"tokenHeader\":\"X-Access-Token\"}", 1));

        MockServerWebExchange exchange = createExchange("/test", "X-Access-Token", "my-token");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void tokenFromQueryParam() {
        plugin.onConfigChange(new PluginConfig("oauth2",
                "{\"clientId\":\"test-client\",\"tokenQuery\":\"access_token\"}", 1));

        MockServerWebExchange exchange = createExchange("/test?access_token=my-token");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void noAuthUriReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("oauth2",
                "{\"clientId\":\"test-client\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("oauth2", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
