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

    // ===== S12-2：matchPath 已删除（死代码，匹配能力统一由 engine 的 PathPattern 匹配器承担）=====

    @Test
    void normalizeRequestPath_null() {
        assertEquals("/", RoutePathUtils.normalizeRequestPath(null));
    }

    @Test
    void normalizeRequestPath_empty() {
        assertEquals("/", RoutePathUtils.normalizeRequestPath(""));
    }

    @Test
    void normalizeRequestPath_noLeadingSlash() {
        assertEquals("/api/users", RoutePathUtils.normalizeRequestPath("api/users"));
    }

    @Test
    void normalizeRequestPath_keepsTrailingSlash() {
        // 匹配用归一不剥尾斜杠（SCG matchTrailingSlash=true 口径）
        assertEquals("/api/users/", RoutePathUtils.normalizeRequestPath("/api/users/"));
        assertEquals("/api/users/", RoutePathUtils.normalizeRequestPath("api/users/"));
    }

    @Test
    void normalizeRequestPath_root() {
        assertEquals("/", RoutePathUtils.normalizeRequestPath("/"));
    }
}
