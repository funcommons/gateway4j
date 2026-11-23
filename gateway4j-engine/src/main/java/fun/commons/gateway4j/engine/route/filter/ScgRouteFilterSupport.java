package fun.commons.gateway4j.engine.route.filter;

import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import jakarta.validation.Configuration;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.handler.IgnoreTopLevelConverterNotFoundBindHandler;
import org.springframework.boot.context.properties.source.ConfigurationPropertySource;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.cloud.gateway.filter.FilterDefinition;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.OrderedGatewayFilter;
import org.springframework.cloud.gateway.filter.factory.GatewayFilterFactory;
import org.springframework.cloud.gateway.support.ConfigurationService;
import org.springframework.cloud.gateway.support.HasRouteId;
import org.springframework.core.Ordered;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 路由级 SCG 原生 filter 支持（S12-7a）。
 *
 * <p>本类是「路由级 filter」与 Spring Cloud Gateway 之间的唯一接缝，与
 * {@link ScgRoutePredicateSupport}（S12-1 谓词）同构：</p>
 * <ul>
 *   <li><b>定义串解析</b>用 SCG 自己的 {@link FilterDefinition}（其构造器就是
 *       SCG YAML {@code filters:} 的解析器：{@code name=value} + 逗号切参）；</li>
 *   <li><b>shortcut 归一化</b>用 SCG 自己的
 *       {@link org.springframework.cloud.gateway.support.ShortcutConfigurable.ShortcutType#normalize}；</li>
 *   <li><b>Config 绑定</b>优先走 SCG 自己的
 *       {@link ConfigurationService#with(GatewayFilterFactory)}
 *       （即 {@code RouteDefinitionRouteLocator#loadGatewayFilters} 的同款路径），
 *       不可用时退回内置绑定器（后者复用 {@link ScgRoutePredicateSupport} 的
 *       转换服务构造 + 逐字复刻 {@code ConfigurationService.bindOrCreate}）；</li>
 *   <li><b>装配语义</b>复刻 SCG {@code loadGatewayFilters}：
 *       {@code HasRouteId} Config 注入 routeId → {@code factory.apply(config)} →
 *       非 {@link Ordered} 的 filter 包 {@link OrderedGatewayFilter}(i+1)。</li>
 * </ul>
 *
 * <p>内置工厂清单（名字口径 = SCG {@code GatewayFilterFactory#name()}，即类名去掉
 * GatewayFilterFactory 后缀）：AddRequestHeader / AddRequestHeadersIfNotPresent /
 * AddRequestParameter / AddResponseHeader / MapRequestHeader / RemoveRequestHeader /
 * RemoveResponseHeader / RemoveRequestParameter / SetRequestHeader / SetResponseHeader /
 * SetRequestHostHeader / SetRequestUri / SetPath / RewritePath / RewriteResponseHeader /
 * RewriteRequestParameter / RewriteLocationResponseHeader / PrefixPath / StripPrefix /
 * PreserveHostHeader / RedirectTo / SetStatus / DedupeResponseHeader /
 * RequestHeaderSize / RequestSize / SecureHeaders / SaveSession / FallbackHeaders /
 * CacheRequestBody / Retry。全部可无参构造（SecureHeaders 以默认
 * {@code SecureHeadersProperties} 构造，CacheRequestBody 自建 codec readers）——
 * 与 SCG {@code GatewayAutoConfiguration} 的 bean 清单同源。</p>
 *
 * <p><b>不在清单内的工厂</b>（SCG 有但无法由「定义串 + 无参构造」安全装配，一律走
 * 「未知 filter 名 → 跳过 + WARN」）：CircuitBreaker / SpringCloudCircuitBreaker
 * （需 {@code CircuitBreakerFactory} bean）、RequestRateLimiter（需
 * {@code RateLimiter}/{@code KeyResolver} bean）、LocalResponseCache（需
 * {@code ResponseCacheManagerFactory} + Caffeine 装配）、ModifyRequestBody /
 * ModifyResponseBody（config 含 {@code RewriteFunction} lambda，定义串表达不了）、
 * TokenRelay（需 OAuth2 上下文）、JsonToGrpc（需 gRPC SSL 配置）。</p>
 *
 * <p><b>失败语义分两类</b>（与谓词同构，主 agent 裁决，2026-11-23）：</p>
 * <ul>
 *   <li><b>格式非法 / 未知 filter 名</b>（{@code Foo=bar}、名字拼错等）
 *       → <b>跳过该 filter + WARN</b>，其余 filter 照常生效。SCG 那边是启动期
 *       "Unable to find GatewayFilterFactory"（{@code failOnRouteDefinitionError=true}
 *       默认 → 整条路由不注册），我们降级为跳过：未知名多半是版本/拼写问题，
 *       跳过不影响同路由其余 filter。</li>
 *   <li><b>已知 filter 缺必填参数 / 参数值非法 / 含 SpEL</b>（{@code AddRequestHeader=X-Name}
 *       缺 value（NameValueConfig 的 {@code @NotEmpty}）、{@code SetStatus=not-a-status}
 *       （apply 期 HttpStatusHolder.parse 抛）等）→ <b>恒不放行 filter</b>：该 filter
 *       置 503 并结束响应、<b>永不调用 chain</b>（下游永不触达）+ WARN。SCG 的口径是
 *       绑定/校验失败 → 整条路由加载失败 → 不注册 → 永不服务（fail-closed 于路由
 *       准入层）；这里「恒不放行」达到效果等价（该路由的每个请求都被拒绝、请求永不
 *       到达上游），但保留 gateway4j 的网关级 fail-safe（不炸网关、不影响其它路由）。
 *       <b>与 SCG 的可观测差异</b>：SCG 返回 404（路由不存在），我们返回 503
 *       （路由存在但装配失败被拒绝）——选 503 是为了运维可区分「没这条路由」与
 *       「这条路由配置坏了」。</li>
 * </ul>
 *
 * <p>要点：<b>配置写错绝不放宽下游访问</b>——已知 filter 写错时该路由的请求全被
 * 拒绝，而不是「少了 filter 照常放行」。</p>
 */
public class ScgRouteFilterSupport {

    private static final Logger log = LoggerFactory.getLogger(ScgRouteFilterSupport.class);

    /**
     * 恒不放行 filter：已知 filter 但定义串缺必填参数/参数值非法/含 SpEL 时使用。
     *
     * <p>与 SCG 等价：SCG 在绑定/校验失败时让整条路由加载失败 → 不注册 → 永不服务；
     * 这里用「恒不放行」（503 + 永不 chain.filter）达到同一效果（请求永不触达下游），
     * 但保留网关级 fail-safe（不炸网关、不影响其它路由）。</p>
     */
    private static final class DenyFilter implements GatewayFilter {

        @Override
        public Mono<Void> filter(ServerWebExchange exchange,
                                 org.springframework.cloud.gateway.filter.GatewayFilterChain chain) {
            log.warn("Route {} has an invalid SCG filter config: denying the request "
                    + "(aligned with SCG: invalid filter → route not registered)",
                    exchange.getRequest().getPath());
            exchange.getResponse().setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            return exchange.getResponse().setComplete();
        }

        @Override
        public String toString() {
            return "ScgRouteFilterSupport.DenyFilter{reason=invalid filter config, status=503}";
        }
    }

    private static final GatewayFilter DENY = new DenyFilter();

    /** SCG 原生 filter 工厂：名字 → 工厂。 */
    private final Map<String, GatewayFilterFactory<?>> factories;

    /** SCG 自己的 ConfigurationService（可选）：走 SCG 原生 shortcut 绑定。 */
    private final ConfigurationService configurationService;

    /** 内置绑定器用的转换服务（与谓词支持类同一构造：Spring 默认 + SCG ZonedDateTime 转换器）。 */
    private final ConversionService conversionService;

    /** jakarta 校验器（SCG Config 上的 @NotEmpty/@NotNull 口径；provider 缺席时为 null → 跳过校验）。 */
    private final Validator validator;

    private final SpelExpressionParser spelParser = new SpelExpressionParser();

    public ScgRouteFilterSupport() {
        this(null);
    }

    /**
     * @param configurationService SCG 自己的 ConfigurationService（可为 null → 用内置绑定器）
     */
    public ScgRouteFilterSupport(ConfigurationService configurationService) {
        this.configurationService = configurationService;
        this.factories = Map.copyOf(defaultFactories());
        this.conversionService = ScgRoutePredicateSupport.buildConversionService();
        this.validator = lazyValidator();
    }

    public ScgRouteFilterSupport(ConfigurationService configurationService,
                                 Map<String, GatewayFilterFactory<?>> factories) {
        this.configurationService = configurationService;
        this.factories = Map.copyOf(factories);
        this.conversionService = ScgRoutePredicateSupport.buildConversionService();
        this.validator = lazyValidator();
    }

    /**
     * SCG 内置 filter 工厂清单（名字 = {@code GatewayFilterFactory#name()}）。
     * 仅收录可无参构造、且 config 不含「定义串表达不了的对象」的工厂；
     * 需 bean/函数依赖的（CircuitBreaker/RequestRateLimiter/LocalResponseCache/
     * ModifyRequestBody/ModifyResponseBody/TokenRelay/JsonToGrpc）不在此列（见类 javadoc）。
     */
    public static Map<String, GatewayFilterFactory<?>> defaultFactories() {
        Map<String, GatewayFilterFactory<?>> factories = new LinkedHashMap<>();
        register(factories, new org.springframework.cloud.gateway.filter.factory.AddRequestHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.AddRequestHeadersIfNotPresentGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.AddRequestParameterGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.AddResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.MapRequestHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RemoveRequestHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RemoveResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RemoveRequestParameterGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetRequestHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetRequestHostHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetRequestUriGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetPathGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RewritePathGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RewriteResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RewriteRequestParameterGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RewriteLocationResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.PrefixPathGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.StripPrefixGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.PreserveHostHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RedirectToGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SetStatusGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.DedupeResponseHeaderGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RequestHeaderSizeGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RequestSizeGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.SecureHeadersGatewayFilterFactory(
                new org.springframework.cloud.gateway.filter.factory.SecureHeadersProperties()));
        register(factories, new org.springframework.cloud.gateway.filter.factory.SaveSessionGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.FallbackHeadersGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.CacheRequestBodyGatewayFilterFactory());
        register(factories, new org.springframework.cloud.gateway.filter.factory.RetryGatewayFilterFactory());
        return factories;
    }

    private static void register(Map<String, GatewayFilterFactory<?>> factories, GatewayFilterFactory<?> factory) {
        factories.put(factory.name(), factory);
    }

    /**
     * jakarta 校验器：SCG Config 类（NameValueConfig/NameConfig 等）的
     * {@code @NotEmpty}/{@code @NotNull} 口径。provider（hibernate-validator）缺席时
     * 返回 null → 跳过校验（此时缺参由 bind 抛错或运行期行为兜底，fail-open 程度
     * 与「无 ValidationProvider 的 SCG」一致）。
     */
    private static Validator lazyValidator() {
        try {
            Configuration<?> configuration = Validation.byDefaultProvider().configure();
            return configuration.buildValidatorFactory().getValidator();
        } catch (Throwable t) {
            log.warn("Jakarta Validation provider unavailable, SCG filter configs will not be "
                    + "bean-validated (missing-arg detection falls back to bind failures): {}", t.toString());
            return null;
        }
    }

    /** 支持的 filter 名（诊断/管理面展示用）。 */
    public List<String> supportedFilterNames() {
        return List.copyOf(factories.keySet());
    }

    /**
     * 定义串 → SCG 原生 filter。
     *
     * <p>失败分类（见类 javadoc）：</p>
     * <ul>
     *   <li>未知 filter 名 → 抛 {@link IllegalArgumentException}
     *       （调用方据此跳过该 filter，其余 filter 照常生效）；</li>
     *   <li>已知 filter 缺必填参数 / 参数值非法 / 含 SpEL → 返回<b>恒不放行</b> filter
     *       + WARN（与 SCG「路由加载失败 → 不注册」效果等价）。</li>
     * </ul>
     *
     * @param routeId 路由 id（SCG {@code HasRouteId} Config 需要注入，如 Retry）
     * @throws IllegalArgumentException 未知 filter 名
     */
    public GatewayFilter buildFilter(String definition, String routeId) {
        if (definition == null || definition.isBlank()) {
            throw new IllegalArgumentException("blank SCG route filter definition");
        }
        String text = definition.trim();

        // 1) SCG 原生 shortcut 解析（name=value + 逗号切参；无 '=' 时 name-only，
        //    PreserveHostHeader/SecureHeaders/FallbackHeaders/SaveSession 等无参
        //    filter 的合法形态，不能按「缺参」拒——是否合法交给绑定+校验判定）
        FilterDefinition parsed;
        try {
            parsed = new FilterDefinition(text);
        } catch (RuntimeException e) {
            String recovered = ScgRoutePredicateSupport.recoverName(text);
            if (factories.containsKey(recovered)) {
                return deny(definition, "cannot be parsed: " + e.getMessage());
            }
            throw new IllegalArgumentException(
                    "unparsable SCG route filter definition: " + definition, e);
        }
        String name = parsed.getName() == null ? "" : parsed.getName().trim();
        GatewayFilterFactory<?> factory = factories.get(name);
        if (factory == null) {
            throw new IllegalArgumentException("unknown SCG route filter: '" + name
                    + "' (supported: " + factories.keySet() + ")");
        }

        // 2) 禁止 SpEL：定义串来自数据库，不接受 #{...} 求值（fail-closed）
        for (String arg : parsed.getArgs().values()) {
            if (arg != null && arg.trim().startsWith("#{")) {
                return deny(definition, "SpEL expression is not allowed in a route filter definition");
            }
        }

        // 3) SCG 原生 shortcut 归一化（GATHER_LIST / GATHER_LIST_TAIL_FLAG / DEFAULT）
        Map<String, Object> normalized;
        try {
            normalized = factory.shortcutType().normalize(parsed.getArgs(), factory, spelParser, null);
        } catch (RuntimeException e) {
            return deny(definition, "cannot be normalized: " + e.getMessage());
        }

        // 4) 绑定 Config + 校验 + 应用 SCG 原生 filter
        return applyFactory(factory, normalized, parsed, definition, routeId);
    }

    /**
     * 批量构建（复刻 SCG {@code RouteDefinitionRouteLocator#loadGatewayFilters} 的
     * 顺序语义：第 i 个定义串 → 非 Ordered 的 filter 包 OrderedGatewayFilter(i+1)）。
     *
     * <p>两类失败语义不同（见类 javadoc）：</p>
     * <ul>
     *   <li><b>格式非法 / 未知 filter 名</b> → 跳过该 filter + WARN（其余照常生效）；</li>
     *   <li><b>已知 filter 缺必填参数 / 参数值非法</b> → 恒不放行 filter + WARN
     *       （与 SCG「路由加载失败 → 不注册」效果等价）。</li>
     * </ul>
     */
    public List<GatewayFilter> buildFilters(List<String> definitions, String routeId) {
        if (definitions == null || definitions.isEmpty()) {
            return List.of();
        }
        List<GatewayFilter> filters = new ArrayList<>(definitions.size());
        int index = 0;
        for (String definition : definitions) {
            index++;
            try {
                GatewayFilter filter = buildFilter(definition, routeId);
                if (filter instanceof Ordered) {
                    filters.add(filter);
                } else {
                    filters.add(new OrderedGatewayFilter(filter, index));
                }
            } catch (Exception e) {
                log.warn("Skip invalid SCG route filter '{}': {}", definition, e.getMessage());
            }
        }
        return filters;
    }

    /**
     * 恒不放行 filter：已知 filter 但定义串不完整/非法时使用。
     *
     * <p>语义与 SCG 等价：SCG 在绑定/校验失败时让<b>整条路由加载失败 → 不注册 →
     * 永不服务</b>；这里用「恒不放行」（503 + 永不 chain.filter）达到同一效果
     * （请求永不触达下游），但保留网关级 fail-safe（不炸网关、不影响其它路由）。</p>
     */
    private GatewayFilter deny(String definition, String reason) {
        log.warn("SCG route filter '{}' is invalid ({}): requests on the route will be denied "
                + "with 503 (aligned with SCG: invalid filter → route not registered)", definition, reason);
        return DENY;
    }

    /**
     * 绑定 + 应用：复刻 SCG {@code RouteDefinitionRouteLocator#loadGatewayFilters}
     * 的装配段（{@code ConfigurationService.with(factory).name(...).properties(...).bind()}
     * → {@code HasRouteId} 注入 routeId → {@code factory.apply(config)}）。
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private GatewayFilter applyFactory(GatewayFilterFactory factory,
                                       Map<String, Object> normalized,
                                       FilterDefinition parsed,
                                       String definition,
                                       String routeId) {
        Object config;
        try {
            config = bind(factory, normalized, parsed);
            validateConfig(config, definition);
        } catch (Exception e) {
            // 缺必填参数（@NotEmpty 违约）/ 参数值非法 → SCG 侧同样是路由加载失败 → 不注册
            return deny(definition, "cannot be bound: " + e.getMessage());
        }
        GatewayFilter gatewayFilter;
        try {
            // some filters require routeId（SCG loadGatewayFilters 同款：apply 前注入）
            if (config instanceof HasRouteId hasRouteId) {
                hasRouteId.setRouteId(routeId);
            }
            gatewayFilter = (GatewayFilter) factory.apply(config);
        } catch (Exception e) {
            // apply 期失败（如 SetStatus=not-a-status 在 apply 里 parse 抛）→ 不放行
            return deny(definition, "cannot be applied: " + e.getMessage());
        }
        if (gatewayFilter == null) {
            return deny(definition, "factory produced no filter");
        }
        return gatewayFilter;
    }

    /**
     * Config 绑定：优先 SCG 自己的 ConfigurationService（与
     * {@code RouteDefinitionRouteLocator#loadGatewayFilters} 同款路径）；其不可用或
     * 抛错时退回内置绑定器（逐字复刻 {@code ConfigurationService.bindOrCreate}）。
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Object bind(GatewayFilterFactory factory, Map<String, Object> normalized,
                        FilterDefinition parsed) {
        if (configurationService != null) {
            try {
                return configurationService.with(factory)
                        .name(parsed.getName().trim())
                        .properties(parsed.getArgs())
                        .bind();
            } catch (Exception e) {
                log.debug("SCG ConfigurationService binding failed for filter '{}', "
                        + "falling back to the built-in binder: {}", parsed.getName(), e.toString());
            }
        }
        return bindBuiltin(factory, normalized);
    }

    /** 内置绑定器：与 {@code ConfigurationService.bindOrCreate} 同口径。 */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Object bindBuiltin(GatewayFilterFactory factory, Map<String, Object> normalized) {
        Bindable bindable = Bindable.of(factory.getConfigClass());
        List<ConfigurationPropertySource> propertySources =
                Collections.singletonList(new MapConfigurationPropertySource(normalized));
        return new Binder(propertySources, null, conversionService)
                .bindOrCreate(factory.shortcutFieldPrefix(), bindable,
                        new IgnoreTopLevelConverterNotFoundBindHandler());
    }

    /**
     * jakarta 校验（SCG Config 的 {@code @NotEmpty}/{@code @NotNull} 口径）：
     * SCG 生产路径由 ConfigurationService 的 Validator（ValidationBindHandler）执行，
     * 内置绑定器无 validator → 这里统一兜底校验，保证两条路径语义一致。
     * provider 缺席（validator == null）时跳过（见 {@link #lazyValidator()}）。
     */
    private void validateConfig(Object config, String definition) {
        if (validator == null || config == null) {
            return;
        }
        Set<jakarta.validation.ConstraintViolation<Object>> violations =
                validator.validate(config);
        if (!violations.isEmpty()) {
            throw new IllegalArgumentException("config violates SCG constraints: "
                    + violations.iterator().next().getPropertyPath() + " "
                    + violations.iterator().next().getMessage());
        }
    }
}
