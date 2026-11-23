package fun.commons.gateway4j.engine.route.filter;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.OrderedGatewayFilter;
import org.springframework.cloud.gateway.support.StringToZonedDateTimeConverter;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S12-7a：路由级 SCG 原生 filter 支持。
 *
 * <p>失败语义（与 {@code ScgRoutePredicateSupport} 同构，主 agent 裁决口径）：
 * 未知 filter 名 / 语法坏 → 跳过该 filter + WARN；已知 filter 缺必填参数 /
 * 参数值非法 / 含 SpEL → 该 filter <b>恒不放行</b>（请求 503、永不转发下游）
 * + WARN。</p>
 */
class ScgRouteFilterSupportTest {

    /** 默认走内置绑定器（SCG ConfigurationService 不可用时的等价路径）。 */
    private final ScgRouteFilterSupport support = new ScgRouteFilterSupport();

    // ------------------------------------------------------------------
    // 1) AddRequestHeader：绑出 filter 且真实作用（请求头被加上）
    //    SCG 的 AddRequestHeader 是 AbstractNameValueGatewayFilterFactory
    //    （name+value @NotEmpty），apply 返回普通 GatewayFilter。
    // ------------------------------------------------------------------
    @Test
    void addRequestHeaderFilterActuallyAddsTheHeader() {
        GatewayFilter filter = support.buildFilter("AddRequestHeader=X-Foo, bar", "1");

        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/api/user"));
        filter.filter(exchange, chain(forwarded::set)).block();

        assertEquals("bar", forwarded.get().getRequest().getHeaders().getFirst("X-Foo"));
    }

    // ------------------------------------------------------------------
    // 1b) 批量路径复刻 SCG loadGatewayFilters：非 Ordered 的 filter 包
    //     OrderedGatewayFilter(i+1)
    // ------------------------------------------------------------------
    @Test
    void batchWrapsPlainFiltersAsOrderedLikeScg() {
        List<GatewayFilter> filters = support.buildFilters(
                List.of("AddRequestHeader=X-Foo, bar", "PreserveHostHeader"), "1");

        assertEquals(2, filters.size());
        assertTrue(filters.get(0) instanceof OrderedGatewayFilter);
        assertEquals(1, ((OrderedGatewayFilter) filters.get(0)).getOrder());
        assertTrue(filters.get(1) instanceof OrderedGatewayFilter);
        assertEquals(2, ((OrderedGatewayFilter) filters.get(1)).getOrder());
    }

    // ------------------------------------------------------------------
    // 2) RewritePath：SCG 文档原样 shortcut（正则捕获组 + $\{segment} 转义）
    // ------------------------------------------------------------------
    @Test
    void rewritePathFilterRewritesTheRequestPath() {
        GatewayFilter filter = support.buildFilter(
                "RewritePath=/red/(?<segment>.*), /$\\{segment}", "1");

        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/red/123"));
        filter.filter(exchange, chain(forwarded::set)).block();

        assertEquals("/123", forwarded.get().getRequest().getPath().value());
    }

    // ------------------------------------------------------------------
    // 3) 未知 filter 名 → 抛 IllegalArgumentException（调用方跳过）
    // ------------------------------------------------------------------
    @Test
    void unknownFilterIsRejected() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> support.buildFilter("Foo=bar", "1"));
        assertTrue(error.getMessage().contains("Foo"));
    }

    // ------------------------------------------------------------------
    // 4) 未知 filter 名 → 批量里跳过该 filter，其余照常生效
    // ------------------------------------------------------------------
    @Test
    void unknownFilterIsSkippedAndOthersStillWork() {
        List<GatewayFilter> filters = support.buildFilters(
                List.of("Foo=bar", "AddRequestHeader=X-Foo, bar"), "1");

        assertEquals(1, filters.size());
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        filters.get(0).filter(exchange(MockServerHttpRequest.get("/x")), chain(forwarded::set)).block();
        assertEquals("bar", forwarded.get().getRequest().getHeaders().getFirst("X-Foo"));
    }

    // ------------------------------------------------------------------
    // 5) 已知 filter 缺必填参数（value 缺失，@NotEmpty 违约）→ 恒不放行
    //    （对齐 SCG：绑定校验失败 → 整条路由加载失败 → 永不服务）
    // ------------------------------------------------------------------
    @Test
    void missingRequiredArgumentYieldsDenyFilter() {
        GatewayFilter filter = support.buildFilter("AddRequestHeader=X-Only-Name", "1");

        AtomicBoolean forwarded = new AtomicBoolean(false);
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/x"));
        filter.filter(exchange, chain(ex -> forwarded.set(true))).block();

        assertFalse(forwarded.get());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    // ------------------------------------------------------------------
    // 6) 已知 filter 参数值非法（SetStatus 非 3xx/合法状态码，apply 期抛）
    //    → 恒不放行
    // ------------------------------------------------------------------
    @Test
    void invalidValueYieldsDenyFilter() {
        GatewayFilter filter = support.buildFilter("SetStatus=not-a-status", "1");

        AtomicBoolean forwarded = new AtomicBoolean(false);
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/x"));
        filter.filter(exchange, chain(ex -> forwarded.set(true))).block();

        assertFalse(forwarded.get());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    // ------------------------------------------------------------------
    // 7) 无参的合法 filter（PreserveHostHeader 裸名，SCG 合法用法）→ 正常放行
    //    （与谓词不同：filter 的无参定义对部分工厂是合法的，不能按缺参拒）
    // ------------------------------------------------------------------
    @Test
    void bareKnownFilterWithoutArgsStillPasses() {
        List<GatewayFilter> filters = support.buildFilters(List.of("PreserveHostHeader"), "1");

        assertEquals(1, filters.size());
        AtomicBoolean forwarded = new AtomicBoolean(false);
        filters.get(0).filter(exchange(MockServerHttpRequest.get("/x")), chain(ex -> forwarded.set(true))).block();
        assertTrue(forwarded.get());
    }

    // ------------------------------------------------------------------
    // 8) SpEL（#{...}，定义串来自 DB）→ 拒绝 → 恒不放行（fail-closed）
    // ------------------------------------------------------------------
    @Test
    void spelExpressionIsRejected() {
        GatewayFilter filter = support.buildFilter("AddRequestHeader=X-Foo, #{T(java.lang.Runtime)}", "1");

        AtomicBoolean forwarded = new AtomicBoolean(false);
        MockServerWebExchange exchange = exchange(MockServerHttpRequest.get("/x"));
        filter.filter(exchange, chain(ex -> forwarded.set(true))).block();

        assertFalse(forwarded.get());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exchange.getResponse().getStatusCode());
    }

    // ------------------------------------------------------------------
    // 9) 走 SCG 自己的 ConfigurationService：语义与内置绑定器一致
    // ------------------------------------------------------------------
    @Test
    void scgConfigurationServicePathProducesTheSameSemantics() {
        ScgRouteFilterSupport withScg = new ScgRouteFilterSupport(newScgConfigurationService());

        GatewayFilter addHeader = withScg.buildFilter("AddRequestHeader=X-Foo, bar", "1");
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        addHeader.filter(exchange(MockServerHttpRequest.get("/x")), chain(forwarded::set)).block();
        assertEquals("bar", forwarded.get().getRequest().getHeaders().getFirst("X-Foo"));

        GatewayFilter strip = withScg.buildFilter("StripPrefix=1", "1");
        AtomicReference<ServerWebExchange> stripped = new AtomicReference<>();
        strip.filter(exchange(MockServerHttpRequest.get("/api/user")), chain(stripped::set)).block();
        assertEquals("/user", stripped.get().getRequest().getPath().value());
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
        return MockServerWebExchange.builder(request.build()).build();
    }

    private static GatewayFilterChain chain(java.util.function.Consumer<ServerWebExchange> onForward) {
        return exchange -> {
            onForward.accept(exchange);
            return Mono.empty();
        };
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
                // no-op：必填参数由 ScgRouteFilterSupport 自身的 jakarta 校验兜底
            }
        };
        return new org.springframework.cloud.gateway.support.ConfigurationService(
                beanFactory, () -> conversionService, () -> validator);
    }
}
