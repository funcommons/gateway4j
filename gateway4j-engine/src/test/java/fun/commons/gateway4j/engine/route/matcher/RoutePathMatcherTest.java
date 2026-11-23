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

    // ===== S12-2：路径语义统一到 Spring PathPattern（与 SCG 注册层同源同语义）=====

    /**
     * 缺陷①核心锚：{@code {segment}} 变量路由在分发层必须能命中
     * （此前自研匹配器只认 {@code /**} / {@code /*} / 全等三种，变量路由静默 404）。
     */
    @Test
    void variableSegmentRouteMatchesLiteralSegment() {
        matcher.addRoute(1L, "/foo/{seg}");
        assertEquals(Optional.of(1L), matcher.match("/foo/bar"));
        assertEquals(Optional.empty(), matcher.match("/foo/bar/baz"));
    }

    /** 缺陷①：{@code {seg:[0-9]+}} 带正则约束的变量段只命中数字段。 */
    @Test
    void variableSegmentWithRegexMatchesNumericSegmentOnly() {
        matcher.addRoute(1L, "/foo/{seg:[0-9]+}");
        assertEquals(Optional.of(1L), matcher.match("/foo/123"));
        assertEquals(Optional.empty(), matcher.match("/foo/abc"));
    }

    /** 缺陷①：{@code {*rest}} 捕获剩余全部段（SCG 原生语法）。 */
    @Test
    void catchAllVariableMatchesDeepPaths() {
        matcher.addRoute(1L, "/foo/{*rest}");
        assertEquals(Optional.of(1L), matcher.match("/foo/a/b/c"));
        assertEquals(Optional.of(1L), matcher.match("/foo"));
    }

    /** 缺陷①：{@code ?} 单字符通配（SCG 原生语法，恰好一段一字符）。 */
    @Test
    void singleCharWildcardMatchesExactlyOneChar() {
        matcher.addRoute(1L, "/api/v?");
        assertEquals(Optional.of(1L), matcher.match("/api/v1"));
        assertEquals(Optional.empty(), matcher.match("/api/v12"));
    }

    /** 回归锚：既有 {@code /**} 语义逐字不变（前缀命中自身/子路径，不命中同前缀兄弟）。 */
    @Test
    void legacyDoubleWildcardSemanticsUnchanged() {
        matcher.addRoute(1L, "/api/**");
        assertEquals(Optional.of(1L), matcher.match("/api"));
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.of(1L), matcher.match("/api/users/123"));
        assertEquals(Optional.empty(), matcher.match("/apifoo"));
        assertEquals(Optional.empty(), matcher.match("/other"));
    }

    /** 回归锚：既有 {@code /*} 语义逐字不变（恰好一段，不跨段）。 */
    @Test
    void legacySingleWildcardSemanticsUnchanged() {
        matcher.addRoute(1L, "/api/*");
        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.empty(), matcher.match("/api/users/123"));
        assertEquals(Optional.empty(), matcher.match("/api"));
        assertEquals(Optional.empty(), matcher.match("/other"));
    }

    /**
     * 缺陷③锚：尾斜杠口径 = SCG 默认（{@code matchTrailingSlash=true}）→
     * pattern {@code /api} 命中 request {@code /api/}。
     */
    @Test
    void trailingSlashFollowsScgDefault() {
        matcher.addRoute(1L, "/api");
        assertEquals(Optional.of(1L), matcher.match("/api"));
        assertEquals(Optional.of(1L), matcher.match("/api/"));
    }

    /** 非法 pattern（如中间段 {@code **}）跳过注册，不误伤其它路由。 */
    @Test
    void invalidPatternIsSkippedAndDoesNotBreakOthers() {
        matcher.addRoute(1L, "/a/**/b");
        matcher.addRoute(2L, "/ok/**");
        assertEquals(Optional.empty(), matcher.match("/a/x/b"));
        assertEquals(Optional.of(2L), matcher.match("/ok/x"));
    }

    /**
     * 缺陷②核心锚（匹配器层）：DISPATCH 父路由与 BACKEND 后置路由前缀重叠时，
     * DISPATCH 必胜——与 SCG 注册层「DISPATCH order=-1_000_000 排前」一致。
     */
    @Test
    void dispatchRouteWinsOverOverlappingBackendRoute() {
        matcher.addRoute(1L, "/api/**", "DISPATCH");
        matcher.addRoute(2L, "/api/user/**", "BACKEND");

        assertEquals(Optional.of(1L), matcher.match("/api/user/1"));
    }

    /** 缺陷②：注册顺序打乱后 winner 不变（DISPATCH 优先是显式仲裁，不依赖注册顺序）。 */
    @Test
    void dispatchRouteWinsRegardlessOfRegistrationOrder() {
        RoutePathMatcher forward = new RoutePathMatcher();
        forward.addRoute(1L, "/api/**", "DISPATCH");
        forward.addRoute(2L, "/api/user/**", "BACKEND");

        RoutePathMatcher reversed = new RoutePathMatcher();
        reversed.addRoute(2L, "/api/user/**", "BACKEND");
        reversed.addRoute(1L, "/api/**", "DISPATCH");

        assertEquals(Optional.of(1L), forward.match("/api/user/1"));
        assertEquals(forward.match("/api/user/1"), reversed.match("/api/user/1"));
    }

    /** 缺陷②：同为 BACKEND 时仍按注册顺序取首个（精确优先于通配的既有语义不变）。 */
    @Test
    void exactRouteStillBeatsWildcardOfSameType() {
        matcher.addRoute(1L, "/api/users", "BACKEND");
        matcher.addRoute(2L, "/api/**", "BACKEND");

        assertEquals(Optional.of(1L), matcher.match("/api/users"));
        assertEquals(Optional.of(2L), matcher.match("/api/orders"));
    }
}
