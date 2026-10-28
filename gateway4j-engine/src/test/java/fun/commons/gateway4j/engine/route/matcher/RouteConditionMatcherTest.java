package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.model.RouteCondition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import static org.junit.jupiter.api.Assertions.*;

class RouteConditionMatcherTest {

    private RouteConditionMatcher matcher;

    @BeforeEach
    void setUp() {
        matcher = new RouteConditionMatcher();
    }

    private MockServerWebExchange exchangeWithHeader(String key, String value) {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").header(key, value).build()
        ).build();
    }

    private MockServerWebExchange exchangeWithQuery(String key, String value) {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test?" + key + "=" + value).build()
        ).build();
    }

    @Test
    void headerEq() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v2").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Version", "v2"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Version", "v1"), cond));
    }

    @Test
    void headerNe() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("NE")
                .conditionKey("X-Version").conditionValue("v2").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Version", "v1"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Version", "v2"), cond));
    }

    @Test
    void headerContains() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("CONTAINS")
                .conditionKey("X-Tag").conditionValue("beta").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Tag", "alpha-beta-gamma"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Tag", "alpha-gamma"), cond));
    }

    @Test
    void headerRegex() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("REGEX")
                .conditionKey("X-Id").conditionValue("^\\d{4}$").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Id", "1234"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Id", "abc"), cond));
    }

    @Test
    void headerExists() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("EXISTS")
                .conditionKey("X-Custom").conditionValue(null).build();
        assertTrue(matcher.match(exchangeWithHeader("X-Custom", "any"), cond));
        assertFalse(matcher.match(MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()).build(), cond));
    }

    @Test
    void queryEq() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("QUERY").operator("EQ")
                .conditionKey("version").conditionValue("2").build();
        assertTrue(matcher.match(exchangeWithQuery("version", "2"), cond));
        assertFalse(matcher.match(exchangeWithQuery("version", "1"), cond));
    }

    @Test
    void headerGt() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("GT")
                .conditionKey("X-Score").conditionValue("50").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Score", "100"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Score", "30"), cond));
    }

    @Test
    void headerLt() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("HEADER").operator("LT")
                .conditionKey("X-Score").conditionValue("50").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Score", "30"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Score", "100"), cond));
    }

    private MockServerWebExchange exchangeWithBody(String body) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.post("/test").build()
        ).build();
        exchange.getAttributes().put(
                fun.commons.gateway4j.common.constant.GatewayConstants.CACHED_REQUEST_BODY_KEY, body);
        return exchange;
    }

    @Test
    void bodyEq() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("BODY").operator("EQ")
                .conditionKey("user.role").conditionValue("admin").build();
        assertTrue(matcher.match(exchangeWithBody("{\"user\":{\"role\":\"admin\"}}"), cond));
        assertFalse(matcher.match(exchangeWithBody("{\"user\":{\"role\":\"guest\"}}"), cond));
    }

    @Test
    void bodyExists() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("BODY").operator("EXISTS")
                .conditionKey("token").build();
        assertTrue(matcher.match(exchangeWithBody("{\"token\":\"abc\"}"), cond));
        assertFalse(matcher.match(exchangeWithBody("{\"other\":1}"), cond));
    }

    @Test
    void bodyNoCacheReturnsFalse() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("BODY").operator("EQ")
                .conditionKey("x").conditionValue("1").build();
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.post("/test").build()).build();
        assertFalse(matcher.match(exchange, cond));
    }

    @Test
    void bodyJsonPathDollarPrefix() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("BODY").operator("EQ")
                .conditionKey("$.a.b").conditionValue("2").build();
        assertTrue(matcher.match(exchangeWithBody("{\"a\":{\"b\":2}}"), cond));
    }

    @Test
    void groovyTrue() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("GROOVY").operator("EQ")
                .conditionValue("headers.getFirst('X-Env') == 'prod'").build();
        assertTrue(matcher.match(exchangeWithHeader("X-Env", "prod"), cond));
        assertFalse(matcher.match(exchangeWithHeader("X-Env", "dev"), cond));
    }

    @Test
    void groovyUsesPath() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("GROOVY").operator("EQ")
                .conditionValue("path.startsWith('/test')").build();
        assertTrue(matcher.match(exchangeWithHeader("X-A", "1"), cond));
    }

    @Test
    void groovyBlankReturnsFalse() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("GROOVY").operator("EQ").conditionValue("  ").build();
        assertFalse(matcher.match(exchangeWithHeader("X-A", "1"), cond));
    }

    @Test
    void groovyErrorReturnsFalse() {
        RouteCondition cond = RouteCondition.builder()
                .conditionType("GROOVY").operator("EQ")
                .conditionValue("throw new RuntimeException('boom')").build();
        assertFalse(matcher.match(exchangeWithHeader("X-A", "1"), cond));
    }
}
