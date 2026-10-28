package fun.commons.gateway4j.plugin.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.server.MockServerWebExchange;

import static org.junit.jupiter.api.Assertions.*;

class PluginContextTest {

    private MockServerWebExchange createExchange() {
        return MockServerWebExchange.builder(
                org.springframework.mock.http.server.reactive.MockServerHttpRequest.get("/test").build()
        ).build();
    }

    @Test
    void setAndGetString() {
        PluginContext ctx = new DefaultPluginContext(createExchange());
        ctx.set("test-key", "hello");
        assertEquals("hello", ctx.get("test-key", String.class));
    }

    @Test
    void setAndGetObject() {
        PluginContext ctx = new DefaultPluginContext(createExchange());
        ctx.set("num-key", 42);
        assertEquals(42, ctx.get("num-key", Integer.class));
    }

    @Test
    void getMissingKeyReturnsNull() {
        PluginContext ctx = new DefaultPluginContext(createExchange());
        assertNull(ctx.get("nonexistent", String.class));
    }

    @Test
    void typeMismatchThrowsClassCast() {
        PluginContext ctx = new DefaultPluginContext(createExchange());
        ctx.set("string-key", "not-a-number");
        assertThrows(ClassCastException.class, () -> ctx.get("string-key", Integer.class));
    }

    @Test
    void exchange() {
        MockServerWebExchange exchange = createExchange();
        PluginContext ctx = new DefaultPluginContext(exchange);
        assertSame(exchange, ctx.exchange());
    }

    @Test
    void overwritesExistingKey() {
        PluginContext ctx = new DefaultPluginContext(createExchange());
        ctx.set("key", "first");
        ctx.set("key", "second");
        assertEquals("second", ctx.get("key", String.class));
    }
}
