package fun.commons.gateway4j.common.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoutePathUtilsTest {

    @Test
    void normalizePath_null() {
        assertEquals("/", RoutePathUtils.normalizePath(null));
    }

    @Test
    void normalizePath_empty() {
        assertEquals("/", RoutePathUtils.normalizePath(""));
    }

    @Test
    void normalizePath_noLeadingSlash() {
        assertEquals("/api/users", RoutePathUtils.normalizePath("api/users"));
    }

    @Test
    void normalizePath_trailingSlash() {
        assertEquals("/api/users", RoutePathUtils.normalizePath("/api/users/"));
    }

    @Test
    void normalizePath_multipleTrailingSlashes() {
        assertEquals("/api/users", RoutePathUtils.normalizePath("/api/users///"));
    }

    @Test
    void normalizePath_rootPath() {
        assertEquals("/", RoutePathUtils.normalizePath("/"));
    }

    @Test
    void extractPathSegments_root() {
        List<String> segments = RoutePathUtils.extractPathSegments("/");
        assertTrue(segments.isEmpty());
    }

    @Test
    void extractPathSegments_simple() {
        List<String> segments = RoutePathUtils.extractPathSegments("/api/users");
        assertEquals(List.of("api", "users"), segments);
    }

    @Test
    void extractPathSegments_trailingSlash() {
        List<String> segments = RoutePathUtils.extractPathSegments("/api/users/");
        assertEquals(List.of("api", "users"), segments);
    }

    @Test
    void matchPath_exact() {
        assertTrue(RoutePathUtils.matchPath("/api/users", "/api/users"));
    }

    @Test
    void matchPath_exactNotMatch() {
        assertFalse(RoutePathUtils.matchPath("/api/users", "/api/orders"));
    }

    @Test
    void matchPath_doubleStar() {
        assertTrue(RoutePathUtils.matchPath("/api/**", "/api/users/123"));
        assertTrue(RoutePathUtils.matchPath("/api/**", "/api/users"));
        assertTrue(RoutePathUtils.matchPath("/api/**", "/api"));
    }

    @Test
    void matchPath_doubleStarRoot() {
        assertTrue(RoutePathUtils.matchPath("/**", "/anything/nested/deep"));
        assertTrue(RoutePathUtils.matchPath("/**", "/"));
    }

    @Test
    void matchPath_singleStar() {
        assertTrue(RoutePathUtils.matchPath("/api/*", "/api/users"));
        assertFalse(RoutePathUtils.matchPath("/api/*", "/api/users/123"));
    }

    @Test
    void matchPath_singleStarRoot() {
        assertTrue(RoutePathUtils.matchPath("/*", "/anything"));
        assertFalse(RoutePathUtils.matchPath("/*", "/nested/path"));
    }

    @Test
    void matchPath_null() {
        assertFalse(RoutePathUtils.matchPath(null, "/api"));
        assertFalse(RoutePathUtils.matchPath("/api", null));
    }
}
