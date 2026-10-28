package fun.commons.gateway4j.engine.route.matcher;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class RoutePathMatcherTest {

    private RoutePathMatcher matcher;

    @BeforeEach
    void setUp() {
        matcher = new RoutePathMatcher();
    }

    @Test
    void exactMatch() {
        matcher.addRoute(1L, "/api/users");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
    }

    @Test
    void exactMatchNotMatch() {
        matcher.addRoute(1L, "/api/users");
        assertEquals(Optional.empty(), matcher.match("/api/orders"));
    }

    @Test
    void doubleWildcard() {
        matcher.addRoute(1L, "/api/**");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.of(1L), matcher.match("/api/users/123"));
        assertEquals(Optional.of(1L), matcher.match("/api"));
    }

    @Test
    void singleWildcard() {
        matcher.addRoute(1L, "/api/*");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.empty(), matcher.match("/api/users/123"));
    }

    @Test
    void emptyMatcherReturnsEmpty() {
        assertEquals(Optional.empty(), matcher.match("/api/users"));
    }

    @Test
    void multipleRoutes() {
        matcher.addRoute(1L, "/api/users");
        matcher.addRoute(2L, "/api/orders");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.of(2L), matcher.match("/api/orders"));
    }

    @Test
    void wildcardTakesPrecedenceAfterExact() {
        matcher.addRoute(1L, "/api/users");
        matcher.addRoute(2L, "/api/**");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.of(2L), matcher.match("/api/orders"));
    }

    @Test
    void clearRemovesAllRoutes() {
        matcher.addRoute(1L, "/api/users");
        matcher.clear();
        assertEquals(Optional.empty(), matcher.match("/api/users"));
    }

    @Test
    void pathNormalization() {
        matcher.addRoute(1L, "/api/users/");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
    }
}
