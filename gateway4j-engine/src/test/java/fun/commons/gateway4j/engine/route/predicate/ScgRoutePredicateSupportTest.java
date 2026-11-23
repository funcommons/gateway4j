package fun.commons.gateway4j.engine.route.predicate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.cloud.gateway.handler.AsyncPredicate;
import org.springframework.cloud.gateway.support.StringToZonedDateTimeConverter;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-1：路由级 SCG 原生谓词支持。
 *
 * <p>本测试类钉住的是「语义锚」——每条都对应 gateway4j 自研 matcher 做不到或
 * 口径不同的 SCG 行为：Host 的 AntPathMatcher('.') 裸域匹配、Method 多值 +
 * 大小写敏感、Cookie 正则全串 matches、RemoteAddr CIDR、After/Before 时区偏移。</p>
 *
 * <p>失败语义分两类（主 agent 裁决）：未知谓词名 → 跳过该谓词（其余照常）；
 * 已知谓词缺必填参数/参数值非法 → 该谓词恒不匹配（对齐 SCG「路由加载失败 →
 * 不注册」）。</p>
 */
class ScgRoutePredicateSupportTest {

    /** 默认走内置绑定器（SCG ConfigurationService 不可用时的等价路径）。 */
    private final ScgRoutePredicateSupport support = new ScgRoutePredicateSupport();

    // ------------------------------------------------------------------
    // 1) Host：AntPathMatcher('.') 口径 —— **.example.com 能匹配裸域
    // ------------------------------------------------------------------
    @Test
    void hostPredicateMatchesBareDomainAndSubdomain() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Host=**.example.com");

        assertTrue(matches(predicate, host("api.example.com")));
        // SCG AntPathMatcher('.') 口径：** 允许零段 → 裸域命中（gateway4j 旧自研口径做不到）
        assertTrue(matches(predicate, host("example.com")));
        assertTrue(matches(predicate, host("a.b.example.com")));
        assertFalse(matches(predicate, host("example.org")));
    }

    // ------------------------------------------------------------------
    // 2) Method：多值 + 大小写敏感（SCG HttpMethod 枚举口径）
    // ------------------------------------------------------------------
    @Test
    void methodPredicateSupportsMultipleValues() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Method=GET,POST");

        assertTrue(matches(predicate, MockServerHttpRequest.get("/x")));
        assertTrue(matches(predicate, MockServerHttpRequest.post("/x")));
        assertFalse(matches(predicate, MockServerHttpRequest.method(HttpMethod.PUT, "/x")));
        assertFalse(matches(predicate, MockServerHttpRequest.method(HttpMethod.DELETE, "/x")));
    }

    // ------------------------------------------------------------------
    // 3) Cookie：正则全串 matches（不是子串 find）
    // ------------------------------------------------------------------
    @Test
    void cookiePredicateUsesFullStringRegexMatch() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Cookie=session,^v1$");

        assertTrue(matches(predicate, MockServerHttpRequest.get("/x").cookie(new HttpCookie("session", "v1"))));
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x").cookie(new HttpCookie("session", "v2"))));
        // 子串不命中：全串 matches 口径
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x").cookie(new HttpCookie("session", "xv1"))));
        // cookie 名不匹配
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x").cookie(new HttpCookie("other", "v1"))));
        // cookie 缺失
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")));
    }

    // ------------------------------------------------------------------
    // 4) RemoteAddr：CIDR（IpSubnetFilterRule 口径）
    // ------------------------------------------------------------------
    @Test
    void remoteAddrPredicateMatchesCidrRange() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("RemoteAddr=10.0.0.0/8");

        assertTrue(matches(predicate, MockServerHttpRequest.get("/x")
                .remoteAddress(new InetSocketAddress("10.1.2.3", 1234))));
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")
                .remoteAddress(new InetSocketAddress("192.168.1.1", 1234))));
    }

    // ------------------------------------------------------------------
    // 5) After / Before：带时区偏移的 ISO-8601 时刻边界
    // ------------------------------------------------------------------
    @Test
    void afterAndBeforePredicatesUseTimeWindow() {
        String past = offset(-1);
        String future = offset(1);

        assertTrue(matches(support.buildPredicate("After=" + past), MockServerHttpRequest.get("/x")));
        assertFalse(matches(support.buildPredicate("After=" + future), MockServerHttpRequest.get("/x")));
        assertTrue(matches(support.buildPredicate("Before=" + future), MockServerHttpRequest.get("/x")));
        assertFalse(matches(support.buildPredicate("Before=" + past), MockServerHttpRequest.get("/x")));
    }

    // ------------------------------------------------------------------
    // 6) 未知谓词 → 拒绝
    // ------------------------------------------------------------------
    @Test
    void unknownPredicateIsRejected() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> support.buildPredicate("Foo=bar"));
        assertTrue(error.getMessage().contains("Foo"));
    }

    // ------------------------------------------------------------------
    // 7) 格式非法（未知谓词名）→ 跳过该谓词 + 不抛异常 + 其余谓词仍生效
    // ------------------------------------------------------------------
    @Test
    void unknownPredicateIsSkippedAndOthersStillWork() {
        List<AsyncPredicate<ServerWebExchange>> predicates = support.buildPredicates(
                List.of("Foo=bar", "Method=GET"));

        assertEquals(1, predicates.size());
        assertTrue(matches(predicates.get(0), MockServerHttpRequest.get("/x")));
        assertFalse(matches(predicates.get(0), MockServerHttpRequest.method(HttpMethod.PUT, "/x")));
    }

    // ------------------------------------------------------------------
    // 7b) 已知谓词但缺必填参数 → 该谓词恒不匹配（对齐 SCG「路由加载失败 → 不注册」）
    // ------------------------------------------------------------------
    @Test
    void missingRequiredArgumentYieldsNeverMatchPredicate() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Cookie=session");

        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")
                .cookie(new HttpCookie("session", "v1"))));
        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")));
    }

    @Test
    void emptyArgumentYieldsNeverMatchPredicate() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Method=");

        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")));
        assertFalse(matches(predicate, MockServerHttpRequest.post("/x")));
    }

    @Test
    void hostWithoutArgumentYieldsNeverMatchPredicate() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("Host");

        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")
                .header(HttpHeaders.HOST, "api.example.com")));
    }

    @Test
    void invalidValueYieldsNeverMatchPredicate() {
        AsyncPredicate<ServerWebExchange> predicate = support.buildPredicate("After=not-a-date");

        assertFalse(matches(predicate, MockServerHttpRequest.get("/x")));
    }

    @Test
    void missingArgumentInBatchKeepsTheNeverMatchPredicate() {
        List<AsyncPredicate<ServerWebExchange>> predicates = support.buildPredicates(
                List.of("Cookie=session", "Method=GET"));

        // 缺参的谓词不被跳过，而是恒不匹配 → AND 链整体不中
        assertEquals(2, predicates.size());
        assertFalse(matches(predicates.get(0), MockServerHttpRequest.get("/x")
                .cookie(new HttpCookie("session", "v1"))));
        assertTrue(matches(predicates.get(1), MockServerHttpRequest.get("/x")));
    }

    // ------------------------------------------------------------------
    // 8) 走 SCG 自己的 ConfigurationService：语义与内置绑定器一致
    // ------------------------------------------------------------------
    @Test
    void scgConfigurationServicePathProducesTheSameSemantics() {
        ScgRoutePredicateSupport withScg = new ScgRoutePredicateSupport(newScgConfigurationService());

        AsyncPredicate<ServerWebExchange> host = withScg.buildPredicate("Host=**.example.com");
        assertTrue(matches(host, host("api.example.com")));
        assertTrue(matches(host, host("example.com")));
        assertFalse(matches(host, host("example.org")));

        AsyncPredicate<ServerWebExchange> cookie = withScg.buildPredicate("Cookie=session,^v1$");
        assertTrue(matches(cookie, MockServerHttpRequest.get("/x").cookie(new HttpCookie("session", "v1"))));
        assertFalse(matches(cookie, MockServerHttpRequest.get("/x").cookie(new HttpCookie("session", "v2"))));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static MockServerHttpRequest.BaseBuilder<?> host(String host) {
        return MockServerHttpRequest.get("/x").header(HttpHeaders.HOST, host);
    }

    /** 当前时刻的相对偏移（小时），ISO_OFFSET_DATE_TIME 带时区偏移。 */
    private static String offset(int hours) {
        return ZonedDateTime.now().plusHours(hours).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static boolean matches(AsyncPredicate<ServerWebExchange> predicate,
                                    MockServerHttpRequest.BaseBuilder<?> request) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(request.build()).build();
        return Boolean.TRUE.equals(Mono.from(predicate.apply(exchange)).block());
    }

    /**
     * 手工装配 SCG 自己的 ConfigurationService（生产环境由 GatewayAutoConfiguration
     * 提供）：BeanFactory 供 shortcut 归一化，转换服务补 SCG 的 ZonedDateTime 转换器。
     */
    private static org.springframework.cloud.gateway.support.ConfigurationService newScgConfigurationService() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        DefaultConversionService conversionService = new DefaultConversionService();
        conversionService.addConverter(new StringToZonedDateTimeConverter());
        Validator validator = new Validator() {
            @Override
            public boolean supports(Class<?> clazz) {
                return true;
            }

            @Override
            public void validate(Object target, Errors errors) {
                // no-op：必填参数由 ScgRoutePredicateSupport 的 shortcutFieldOrder 检查兜底
            }
        };
        return new org.springframework.cloud.gateway.support.ConfigurationService(
                beanFactory, () -> conversionService, () -> validator);
    }
}
