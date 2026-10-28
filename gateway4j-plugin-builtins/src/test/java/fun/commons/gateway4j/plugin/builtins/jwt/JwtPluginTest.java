package fun.commons.gateway4j.plugin.builtins.jwt;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.Date;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class JwtPluginTest {

    private static final String SECRET = "test-secret-key-for-gateway4j";

    private JwtPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new JwtPlugin();
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

    private PluginChain capturingChain(java.util.concurrent.atomic.AtomicReference<ServerWebExchange> captured) {
        return exchange -> { captured.set(exchange); return Mono.empty(); };
    }

    private String createToken(String secret, Map<String, String> claims) {
        var builder = JWT.create()
                .withIssuer("gateway4j-test")
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000));
        claims.forEach(builder::withClaim);
        return builder.sign(Algorithm.HMAC256(secret));
    }

    private String createExpiredToken(String secret) {
        return JWT.create()
                .withIssuer("gateway4j-test")
                .withIssuedAt(new Date(System.currentTimeMillis() - 7200000))
                .withExpiresAt(new Date(System.currentTimeMillis() - 3600000))
                .sign(Algorithm.HMAC256(secret));
    }

    @Test
    void noConfigPassesThrough() {
        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void missingTokenReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\"}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validTokenInAuthorizationHeaderPasses() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validTokenInCustomHeaderPasses() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"tokenHeader\":\"X-Token\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test", "X-Token", token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void validTokenInTokenHeaderFallback() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test", "token", token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void customHeaderDoesNotFallbackToTokenHeader() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"tokenHeader\":\"X-Custom\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test", "token", token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void expiredTokenReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\"}", 1));

        String token = createExpiredToken(SECRET);
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void wrongSecretReturnsUnauthorized() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\"}", 1));

        String token = createToken("wrong-secret", Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void claimToHeaderConversionSetsCorrectValues() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"converter\":[{\"jwtVal\":\"sub\",\"headerVal\":\"X-User\"}]}",
                1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        java.util.concurrent.atomic.AtomicReference<ServerWebExchange> captured = new java.util.concurrent.atomic.AtomicReference<>();
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, capturingChain(captured))).verifyComplete();
        assertNotNull(captured.get());
        assertEquals("user1", captured.get().getRequest().getHeaders().getFirst("X-User"));
    }

    @Test
    void nestedClaimToHeaderConversion() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"converter\":[{\"jwtVal\":\"user.id\",\"headerVal\":\"X-User-Id\"}]}",
                1));

        String token = JWT.create()
                .withIssuer("gateway4j-test")
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .withClaim("user", Map.of("id", "12345"))
                .sign(Algorithm.HMAC256(SECRET));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void nullSecretKeyRejectsAll() {
        plugin.onConfigChange(new PluginConfig("jwt", "{}", 1));

        MockServerWebExchange exchange = createExchange("/test");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void emptySecretKeyRejectsAll() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void algorithmFieldHS256() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"algorithm\":\"HS256\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void algorithmFieldHS384() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"algorithm\":\"HS384\"}", 1));

        String token = JWT.create()
                .withIssuer("gateway4j-test")
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .withClaim("sub", "user1")
                .sign(Algorithm.HMAC384(SECRET));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void algorithmFieldHS512() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"algorithm\":\"HS512\"}", 1));

        String token = JWT.create()
                .withIssuer("gateway4j-test")
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + 3600000))
                .withClaim("sub", "user1")
                .sign(Algorithm.HMAC512(SECRET));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void algorithmRS256WithoutPublicKeyRejects() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"unused\",\"algorithm\":\"RS256\"}", 1));

        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer some-token");
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void unsupportedAlgorithmFallsBackToHS256() {
        plugin.onConfigChange(new PluginConfig("jwt",
                "{\"secretKey\":\"" + SECRET + "\",\"algorithm\":\"UNKNOWN\"}", 1));

        String token = createToken(SECRET, Map.of("sub", "user1"));
        MockServerWebExchange exchange = createExchange("/test",
                "Authorization", "Bearer " + token);
        StepVerifier.create(plugin.execute(exchange, passThroughChain())).verifyComplete();
        assertNotEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
    }

    @Test
    void pluginIdAndPhase() {
        assertEquals("jwt", plugin.pluginId());
        assertEquals("PRE", plugin.phase());
    }
}
