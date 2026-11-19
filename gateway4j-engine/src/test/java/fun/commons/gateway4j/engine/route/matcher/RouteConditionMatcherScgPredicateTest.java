package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.model.RouteCondition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import java.net.InetSocketAddress;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S10-1（T 步 RED 先行）：新增 7 个 SCG predicate 对齐条件类型的契约测试。
 *
 * <p>用户裁决：条件模型 100% Spring Cloud Gateway predicate 对齐。本文件钉死
 * HOST / METHOD / COOKIE / REMOTE_ADDR / AFTER / BEFORE / BETWEEN 七个新类型的
 * 行为契约（C 步照做），并锚定既有六类型（HEADER/PATH/QUERY/BODY/GROOVY/WEIGHT）
 * 的代表性行为防止 C 步回归。
 *
 * <p>RED 形态（当前基线）：新类型在 {@link RouteConditionMatcher} switch 中落
 * {@code default -> false}，凡契约断言「应匹配」的用例当前为红；「不应匹配」的
 * 负向用例天然绿，用于防 C 步矫枉过正（如 HOST 缺失头时回落 RemoteAddress）。
 *
 * <p>边界说明：AFTER/BEFORE/BETWEEN 以 {@code Instant.now()} 为请求时间，
 * matcher 无时钟注入点，故 [start, end) 的「start 含端」只能以近似方式钉住
 * （start=测试时刻、end=+1h，实现严格大于会以极低概率抖动）；「end 含端」
 * 用早已过期的区间钉住（now 已越过 end，无论含端与否都必须 false）。
 * 精确端点语义由 C 步 code review 复核。
 */
class RouteConditionMatcherScgPredicateTest {

    private RouteConditionMatcher matcher;

    @BeforeEach
    void setUp() {
        matcher = new RouteConditionMatcher();
    }

    // ------------------------------------------------------------------
    // helpers（跟随 RouteConditionMatcherTest 既有 MockServerWebExchange 惯例；
    // 探针结论：MockServerHttpRequest 不会自动派生 Host 头，缺失头场景无需 mock）
    // ------------------------------------------------------------------

    private RouteCondition cond(String type, String operator, String key, String value) {
        return RouteCondition.builder()
                .conditionType(type).operator(operator)
                .conditionKey(key).conditionValue(value).build();
    }

    private MockServerWebExchange exchangeWithHost(String host) {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").header(HttpHeaders.HOST, host).build()
        ).build();
    }

    private MockServerWebExchange exchangeWithRemoteAddr(String ip) {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").remoteAddress(new InetSocketAddress(ip, 40000)).build()
        ).build();
    }

    private MockServerWebExchange exchangeWithCookie(String name, String value) {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").cookie(new HttpCookie(name, value)).build()
        ).build();
    }

    private MockServerWebExchange plainExchange() {
        return MockServerWebExchange.builder(
                MockServerHttpRequest.get("/test").build()
        ).build();
    }

    /** 契约示例格式（ISO-8601 带时区偏移），远早于/晚于任何真实测试时刻。 */
    private static final String PAST = "2000-01-01T00:00:00+08:00";
    private static final String FUTURE = "2099-01-01T00:00:00+08:00";

    // ==================================================================
    // HOST —— condition_value 为 SCG HostPredicate pattern 或正则；
    // pattern 模式独立于 operator（value 含通配符即走翻译，不进 matchOperator）；
    // condition_key 一律忽略；匹配目标 = headers.getHost()，Host 头缺失返回 false
    // ==================================================================

    @Test
    void hostDoubleStarMatchesSubAndMultiLevel() {
        // `**` 匹配任意层级：至少一段（api）或多段（a.b）
        RouteCondition pattern = cond("HOST", "EQ", null, "**.example.com");
        assertTrue(matcher.match(exchangeWithHost("api.example.com"), pattern),
                "**.example.com 应匹配单层子域 api.example.com");
        assertTrue(matcher.match(exchangeWithHost("a.b.example.com"), pattern),
                "**.example.com 应匹配多层子域 a.b.example.com");
    }

    @Test
    void hostDoubleStarRejectsBareDomainAndOtherTld() {
        RouteCondition pattern = cond("HOST", "EQ", null, "**.example.com");
        assertFalse(matcher.match(exchangeWithHost("example.com"), pattern),
                "`**.` 要求至少一段，裸域 example.com 不匹配");
        assertFalse(matcher.match(exchangeWithHost("api.example.org"), pattern),
                "不同 TLD example.org 不匹配");
    }

    @Test
    void hostSingleStarMatchesExactlyOneSegment() {
        // `*` 匹配单个段：*.example.com 命中一层子域，不命中两层
        RouteCondition c = cond("HOST", "EQ", null, "*.example.com");
        assertTrue(matcher.match(exchangeWithHost("api.example.com"), c),
                "*.example.com 应匹配单段子域 api.example.com");
        assertFalse(matcher.match(exchangeWithHost("a.b.example.com"), c),
                "*.example.com 不应匹配双段子域 a.b.example.com");
    }

    @Test
    void hostEqExactDomain() {
        // EQ 精确域名单值也须工作（无通配符 value 走 matchOperator/EQ 语义）
        RouteCondition exact = cond("HOST", "EQ", null, "api.example.com");
        assertTrue(matcher.match(exchangeWithHost("api.example.com"), exact));
        assertFalse(matcher.match(exchangeWithHost("www.example.com"), exact),
                "EQ 精确域名不匹配其它子域");
    }

    @Test
    void hostConditionKeyIgnored() {
        // condition_key 空忽略——即便误填 key 也不影响匹配
        RouteCondition withKey = cond("HOST", "EQ", "X-Some-Key", "**.example.com");
        assertTrue(matcher.match(exchangeWithHost("api.example.com"), withKey));
    }

    @Test
    void hostMissingHostHeaderReturnsFalse() {
        // Host 头缺失（探针证实 mock 不会自动派生）必须 false——不得回落 getRemoteAddress
        RouteCondition pattern = cond("HOST", "EQ", null, "**.example.com");
        MockServerWebExchange noHostButRemote =
                MockServerWebExchange.builder(
                        MockServerHttpRequest.get("/test")
                                .remoteAddress(new InetSocketAddress("93.184.216.34", 443)).build()
                ).build();
        assertFalse(matcher.match(noHostButRemote, pattern),
                "Host 头缺失时禁止回落 RemoteAddress 判定");
        assertFalse(matcher.match(plainExchange(), pattern));
    }

    @Test
    void hostMatchCaseInsensitiveLikeScgHostPredicate() {
        // SCG HostPredicate 对请求 Host 先 toLowerCase 再匹配（大小写不敏感）
        RouteCondition pattern = cond("HOST", "EQ", null, "**.example.com");
        assertTrue(matcher.match(exchangeWithHost("API.EXAMPLE.COM"), pattern),
                "SCG 口径 Host 匹配大小写不敏感");
    }

    // ==================================================================
    // METHOD —— condition_value 为 HTTP 方法名；EQ 大小写不敏感；仅 EQ/NE 语义有效
    // ==================================================================

    @Test
    void methodEqMatchesAndRejects() {
        RouteCondition get = cond("METHOD", "EQ", null, "GET");
        assertTrue(matcher.match(plainExchange(), get), "GET 请求命中 GET");
        assertFalse(matcher.match(
                MockServerWebExchange.builder(MockServerHttpRequest.post("/test").build()).build(),
                get), "POST 请求不命中 GET");
    }

    @Test
    void methodEqCaseInsensitive() {
        RouteCondition lower = cond("METHOD", "EQ", null, "post");
        assertTrue(matcher.match(
                        MockServerWebExchange.builder(MockServerHttpRequest.post("/test").build()).build(),
                        lower),
                "EQ 大小写不敏感：post 命中 POST 请求");
    }

    @Test
    void methodNe() {
        RouteCondition notGet = cond("METHOD", "NE", null, "GET");
        assertTrue(matcher.match(
                        MockServerWebExchange.builder(MockServerHttpRequest.post("/test").build()).build(),
                        notGet));
        assertFalse(matcher.match(plainExchange(), notGet), "GET 请求对 NE GET 不命中");
    }

    // ==================================================================
    // COOKIE —— condition_key=cookie 名，取 cookies.getFirst(key).value 走 matchOperator；
    // 缺失时同 HEADER 既有口径（EXISTS=false，NE=true）
    // ==================================================================

    @Test
    void cookieEqMatchesAndRejects() {
        RouteCondition eq = cond("COOKIE", "EQ", "session", "abc");
        assertTrue(matcher.match(exchangeWithCookie("session", "abc"), eq));
        assertFalse(matcher.match(exchangeWithCookie("session", "zzz"), eq));
    }

    @Test
    void cookieContainsOnValue() {
        RouteCondition contains = cond("COOKIE", "CONTAINS", "session", "abc");
        assertTrue(matcher.match(exchangeWithCookie("session", "xx-abc-yy"), contains));
        assertFalse(matcher.match(exchangeWithCookie("session", "zz"), contains));
    }

    @Test
    void cookieMissingExistsFalse() {
        RouteCondition exists = cond("COOKIE", "EXISTS", "session", null);
        assertTrue(matcher.match(exchangeWithCookie("session", "any"), exists));
        assertFalse(matcher.match(plainExchange(), exists), "cookie 缺失时 EXISTS=false（同 HEADER 口径）");
    }

    @Test
    void cookieMissingNeTrue() {
        RouteCondition ne = cond("COOKIE", "NE", "session", "abc");
        assertTrue(matcher.match(plainExchange(), ne), "cookie 缺失时 NE=true（同 HEADER 既有口径）");
        assertFalse(matcher.match(exchangeWithCookie("session", "abc"), ne));
    }

    // ==================================================================
    // REMOTE_ADDR —— condition_value=CIDR（IpSubnetFilterRule 口径）；
    // 匹配 getRemoteAddress()；无斜杠纯 IP 视为 /32 单值 EQ
    // ==================================================================

    @Test
    void remoteAddrCidrV4() {
        RouteCondition cidr = cond("REMOTE_ADDR", "EQ", null, "1.2.3.0/24");
        assertTrue(matcher.match(exchangeWithRemoteAddr("1.2.3.4"), cidr));
        assertTrue(matcher.match(exchangeWithRemoteAddr("1.2.3.255"), cidr), "/24 网段尾部地址命中");
        assertFalse(matcher.match(exchangeWithRemoteAddr("10.0.0.5"), cidr), "网段外地址不命中");
        assertFalse(matcher.match(exchangeWithRemoteAddr("1.2.4.1"), cidr), "/24 边界外一位不命中");
    }

    @Test
    void remoteAddrCidrV6() {
        RouteCondition cidr = cond("REMOTE_ADDR", "EQ", null, "2001:db8::/32");
        assertTrue(matcher.match(exchangeWithRemoteAddr("2001:db8::1"), cidr));
        assertFalse(matcher.match(exchangeWithRemoteAddr("2001:db9::1"), cidr), "前缀外 IPv6 不命中");
    }

    @Test
    void remoteAddrPlainIpTreatedAsSingleHost() {
        // 无斜杠纯 IP 视为 /32 单值 EQ
        RouteCondition single = cond("REMOTE_ADDR", "EQ", null, "1.2.3.4");
        assertTrue(matcher.match(exchangeWithRemoteAddr("1.2.3.4"), single));
        assertFalse(matcher.match(exchangeWithRemoteAddr("1.2.3.5"), single));
    }

    // ==================================================================
    // AFTER / BEFORE —— condition_value=ISO-8601 日期时间（不走 matchOperator，
    // operator 不参与时间比较语义）；解析失败 false
    // ==================================================================

    @Test
    void afterPastValueMatches() {
        assertTrue(matcher.match(plainExchange(), cond("AFTER", "EQ", null, PAST)),
                "请求时间 > 过去值即 true");
    }

    @Test
    void afterFutureValueNotMatches() {
        assertFalse(matcher.match(plainExchange(), cond("AFTER", "EQ", null, FUTURE)),
                "请求时间 < 未来值不命中");
    }

    @Test
    void afterOperatorIndependent() {
        // 时间比较专用：operator 不参与（EQ 走字符串比较则本断言必败）
        assertTrue(matcher.match(plainExchange(), cond("AFTER", "REGEX", "ignored", PAST)));
    }

    @Test
    void afterInvalidValueReturnsFalse() {
        assertFalse(matcher.match(plainExchange(), cond("AFTER", "EQ", null, "not-a-date")),
                "解析失败返回 false");
        assertFalse(matcher.match(plainExchange(), cond("AFTER", "EQ", null, null)),
                "value 缺失返回 false");
    }

    @Test
    void beforeFutureValueMatches() {
        assertTrue(matcher.match(plainExchange(), cond("BEFORE", "EQ", null, FUTURE)),
                "请求时间 < 未来值即 true");
    }

    @Test
    void beforePastValueNotMatches() {
        assertFalse(matcher.match(plainExchange(), cond("BEFORE", "EQ", null, PAST)),
                "请求时间 > 过去值不命中");
    }

    @Test
    void beforeInvalidValueReturnsFalse() {
        assertFalse(matcher.match(plainExchange(), cond("BEFORE", "EQ", null, "garbage")));
    }

    // ==================================================================
    // BETWEEN —— condition_value=start,end 逗号分隔两 ISO-8601；闭开区间 [start, end)；
    // key 忽略；不走 matchOperator；解析失败 false
    // ==================================================================

    @Test
    void betweenInsideWindowMatches() {
        assertTrue(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, PAST + "," + FUTURE)),
                "now 落在 [过去, 未来) 内即 true");
    }

    @Test
    void betweenBeforeStartNotMatches() {
        assertFalse(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, FUTURE + ",2099-06-01T00:00:00+08:00")),
                "now < start 不命中");
    }

    @Test
    void betweenAfterEndNotMatches() {
        assertFalse(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, "2000-01-01T00:00:00+08:00,2001-01-01T00:00:00+08:00")),
                "now 已越过 end 必不命中（闭开端点两侧口径皆成立）");
    }

    @Test
    void betweenStartInclusiveApprox() {
        // 时钟不可注入：start=测试时刻、end=+1h，按 [start,end) 应命中。
        // 若 C 步对 start 误用严格大于，本用例以极低概率抖动并暴露偏差。
        Instant now = Instant.now();
        String window = now + "," + now.plusSeconds(3600);
        assertTrue(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, window)),
                "[start, end) start 含端");
    }

    @Test
    void betweenMalformedValueReturnsFalse() {
        assertFalse(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, PAST)),
                "缺逗号（单值）返回 false");
        assertFalse(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, PAST + ",garbage")),
                "end 解析失败返回 false");
        assertFalse(matcher.match(plainExchange(), cond("BETWEEN", "EQ", null, "a,b,c")),
                "多于两段返回 false");
    }

    // ==================================================================
    // 既有六类型行为锚（防 C 步破坏既有行为）
    // ==================================================================

    @Test
    void anchorHeaderEq() {
        RouteCondition c = cond("HEADER", "EQ", "X-Version", "v2");
        assertTrue(matcher.match(exchangeWithHeader("X-Version", "v2"), c));
        assertFalse(matcher.match(exchangeWithHeader("X-Version", "v1"), c));
    }

    @Test
    void anchorHeaderExists() {
        RouteCondition c = cond("HEADER", "EXISTS", "X-Custom", null);
        assertTrue(matcher.match(exchangeWithHeader("X-Custom", "any"), c));
        assertFalse(matcher.match(plainExchange(), c));
    }

    @Test
    void anchorPathContains() {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/v2/users").build()).build();
        assertTrue(matcher.match(exchange, cond("PATH", "CONTAINS", null, "/v2")));
        assertFalse(matcher.match(
                MockServerWebExchange.builder(MockServerHttpRequest.get("/api/v1/users").build()).build(),
                cond("PATH", "CONTAINS", null, "/v2")));
    }

    @Test
    void anchorQueryRegexFindSemantics() {
        // REGEX 语义 = Pattern.compile(expected).matcher(actual).find()（find 非 matches）——
        // 缓存化后行为必须等价
        RouteCondition c = cond("QUERY", "REGEX", "version", "\\d{3}");
        assertTrue(matcher.match(exchangeWithQuery("version", "abc999x"), c),
                "find 语义：部分命中即 true");
        assertFalse(matcher.match(exchangeWithQuery("version", "abx"), c));
    }

    @Test
    void anchorRegexRepeatMatchFunctionalEquivalence() {
        // 预编译缓存的功能等价钉：同一 REGEX 条件重复匹配结果一致
        RouteCondition c = cond("HEADER", "REGEX", "X-Id", "^\\d{4}$");
        MockServerWebExchange exchange = exchangeWithHeader("X-Id", "1234");
        assertTrue(matcher.match(exchange, c));
        assertTrue(matcher.match(exchange, c), "同 pattern 二次匹配行为等价");
        assertFalse(matcher.match(exchangeWithHeader("X-Id", "abc"), c));
        assertFalse(matcher.match(exchangeWithHeader("X-Id", "abc"), c));
    }

    @Test
    void anchorBodyJsonPathEq() {
        RouteCondition c = cond("BODY", "EQ", "user.role", "admin");
        MockServerWebExchange hit = MockServerWebExchange.builder(
                MockServerHttpRequest.post("/test").build()).build();
        hit.getAttributes().put(
                fun.commons.gateway4j.common.constant.GatewayConstants.CACHED_REQUEST_BODY_KEY,
                "{\"user\":{\"role\":\"admin\"}}");
        assertTrue(matcher.match(hit, c));
        MockServerWebExchange miss = MockServerWebExchange.builder(
                MockServerHttpRequest.post("/test").build()).build();
        miss.getAttributes().put(
                fun.commons.gateway4j.common.constant.GatewayConstants.CACHED_REQUEST_BODY_KEY,
                "{\"user\":{\"role\":\"guest\"}}");
        assertFalse(matcher.match(miss, c));
    }

    @Test
    void anchorGroovyTrue() {
        RouteCondition c = cond("GROOVY", "EQ", null, "headers.getFirst('X-Env') == 'prod'");
        assertTrue(matcher.match(exchangeWithHeader("X-Env", "prod"), c));
        assertFalse(matcher.match(exchangeWithHeader("X-Env", "dev"), c));
    }

    @Test
    void anchorWeightNeverMatches() {
        // WEIGHT 不是请求谓词：matcher switch 无 WEIGHT 分支，default false——锚定之
        assertFalse(matcher.match(plainExchange(), cond("WEIGHT", "EQ", "20", null)));
        assertFalse(matcher.match(plainExchange(), cond("WEIGHT", "EXISTS", "80", "anything")));
    }

    // ------------------------------------------------------------------
    // 内部小工具
    // ------------------------------------------------------------------

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
}
