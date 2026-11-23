package fun.commons.gateway4j.engine.route.predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.handler.IgnoreTopLevelConverterNotFoundBindHandler;
import org.springframework.boot.context.properties.source.ConfigurationPropertySource;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.cloud.gateway.handler.AsyncPredicate;
import org.springframework.cloud.gateway.handler.predicate.AfterRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.BeforeRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.BetweenRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.CookieRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.HeaderRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.HostRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.MethodRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.PredicateDefinition;
import org.springframework.cloud.gateway.handler.predicate.QueryRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.RemoteAddrRoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.RoutePredicateFactory;
import org.springframework.cloud.gateway.handler.predicate.XForwardedRemoteAddrRoutePredicateFactory;
import org.springframework.cloud.gateway.support.ConfigurationService;
import org.springframework.cloud.gateway.support.StringToZonedDateTimeConverter;
import org.springframework.core.convert.ConversionService;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.web.server.ServerWebExchange;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 路由级 SCG 原生谓词支持（S12-1）。
 *
 * <p>本类是「路由级谓词」与 Spring Cloud Gateway 之间的唯一接缝：</p>
 * <ul>
 *   <li><b>定义串解析</b>用 SCG 自己的 {@link PredicateDefinition}（其构造器就是
 *       SCG YAML {@code predicates:} 的解析器：{@code name=value} + 逗号切参）；</li>
 *   <li><b>shortcut 归一化</b>用 SCG 自己的
 *       {@link org.springframework.cloud.gateway.support.ShortcutConfigurable.ShortcutType#normalize}
 *       （GATHER_LIST 收拢成列表 / DEFAULT 按 shortcutFieldOrder 逐位映射）；</li>
 *   <li><b>Config 绑定</b>优先走 SCG 自己的
 *       {@link ConfigurationService#with(org.springframework.cloud.gateway.support.ShortcutConfigurable)}
 *       （即 {@code RouteDefinitionRouteLocator#lookup} 的同款路径），不可用时退回内置
 *       绑定器——后者逐字复刻 {@code ConfigurationService.bindOrCreate}
 *       （同 MapConfigurationPropertySource + IgnoreTopLevelConverterNotFoundBindHandler
 *       + Binder.bindOrCreate）；</li>
 *   <li><b>匹配语义</b>100% 由 SCG 自己的 {@code RoutePredicateFactory#apply(config)} 决定，
 *       本类不实现任何一条匹配规则。</li>
 * </ul>
 *
 * <p>支持的谓词（名字口径 = SCG {@code RoutePredicateFactory#name()}）：
 * After / Before / Between / Cookie / Header / Host / Method / Query / RemoteAddr /
 * XForwardedRemoteAddr。Path 不在此列——路由自身的 {@code path} 列已经是 Path 谓词
 * （尾斜杠口径统一由 S12-2 处理）；ReadBody / Weight / CloudFoundry 需要额外装配，
 * 同样不在此列。</p>
 *
 * <p><b>失败语义分两类</b>（主 agent 裁决，2026-11-23）：</p>
 * <ul>
 *   <li><b>格式非法 / 未知谓词名</b>（{@code Foo=bar}、{@code =bar}、名字拼错等）
 *       → <b>跳过该谓词 + WARN</b>，其余谓词照常生效。SCG 那边是启动期
 *       ValidationException / "Unable to find RoutePredicateFactory"（整条路由不注册），
 *       我们降级为跳过：未知谓词名多半是版本/拼写问题，跳过不影响同路由其它谓词。</li>
 *   <li><b>已知谓词但缺必填参数 / 参数值非法</b>（{@code Cookie=session} 缺 regexp、
 *       {@code Host} 无 {@code =}、{@code Method=} 空值、{@code After=not-a-date} 等）
 *       → <b>该谓词恒不匹配 + WARN</b>。SCG 的口径是 shortcut 绑定时 Config 的
 *       {@code @NotEmpty}/{@code @NotNull} 校验失败 → 整条路由加载失败 → 不注册 →
 *       永不被匹配（fail-closed 于路由准入层）；这里用「谓词恒 false」达到<b>效果
 *       等价</b>（AND 链短路 → 整条路由不匹配），但保留 gateway4j 的网关级 fail-safe
 *       （不炸网关、不影响其它路由）。</li>
 * </ul>
 *
 * <p>要点：<b>配置写错绝不放宽准入条件</b>——已知谓词写错时路由不服务，而不是
 * 「少了限制照常服务」。</p>
 */
public class ScgRoutePredicateSupport {

    private static final Logger log = LoggerFactory.getLogger(ScgRoutePredicateSupport.class);

    /**
     * 恒不匹配谓词：已知谓词但定义串缺必填参数/参数值非法时使用。
     *
     * <p>与 SCG 等价：SCG 在 shortcut 绑定失败时让整条路由加载失败 → 不注册 →
     * 永不被匹配；这里用「谓词恒 false」达到同一效果（AND 链短路 → 整条路由不匹配），
     * 但保留网关级 fail-safe（不炸网关、不影响其它路由）。</p>
     */
    private static final AsyncPredicate<ServerWebExchange> NEVER_MATCH =
            AsyncPredicate.from(exchange -> false);

    /** SCG 原生谓词工厂：名字 → 工厂。 */
    private final Map<String, RoutePredicateFactory<?>> factories;

    /** SCG 自己的 ConfigurationService（可选）：走 SCG 原生 shortcut 绑定。 */
    private final ConfigurationService configurationService;

    /** 内置绑定器用的转换服务（SCG 同款 ZonedDateTime 转换器 + Spring 默认转换器）。 */
    private final ConversionService conversionService;

    private final SpelExpressionParser spelParser = new SpelExpressionParser();

    public ScgRoutePredicateSupport() {
        this(null, true);
    }

    public ScgRoutePredicateSupport(ConfigurationService configurationService) {
        this(configurationService, true);
    }

    /**
     * @param configurationService SCG 自己的 ConfigurationService（可为 null → 用内置绑定器）
     * @param hostIncludePort      Host 谓词是否含端口，口径同 SCG
     *                             {@code spring.cloud.gateway.server.webflux.predicate.host.include-port}
     *                             （默认 true：读原始 Host 头）
     */
    public ScgRoutePredicateSupport(ConfigurationService configurationService, boolean hostIncludePort) {
        this(configurationService, defaultFactories(hostIncludePort));
    }

    public ScgRoutePredicateSupport(ConfigurationService configurationService,
                                    Map<String, RoutePredicateFactory<?>> factories) {
        this.configurationService = configurationService;
        this.factories = Map.copyOf(factories);
        this.conversionService = buildConversionService();
    }

    /** SCG 内置谓词工厂清单（名字 = {@code RoutePredicateFactory#name()}）。 */
    public static Map<String, RoutePredicateFactory<?>> defaultFactories(boolean hostIncludePort) {
        Map<String, RoutePredicateFactory<?>> factories = new LinkedHashMap<>();
        register(factories, new AfterRoutePredicateFactory());
        register(factories, new BeforeRoutePredicateFactory());
        register(factories, new BetweenRoutePredicateFactory());
        register(factories, new CookieRoutePredicateFactory());
        register(factories, new HeaderRoutePredicateFactory());
        register(factories, new HostRoutePredicateFactory(hostIncludePort));
        register(factories, new MethodRoutePredicateFactory());
        register(factories, new QueryRoutePredicateFactory());
        register(factories, new RemoteAddrRoutePredicateFactory());
        register(factories, new XForwardedRemoteAddrRoutePredicateFactory());
        return factories;
    }

    private static void register(Map<String, RoutePredicateFactory<?>> factories, RoutePredicateFactory<?> factory) {
        factories.put(factory.name(), factory);
    }

    /**
     * 内置绑定器的转换服务：Spring 默认转换器 + SCG 自带
     * {@link StringToZonedDateTimeConverter}（与 SCG
     * {@code GatewayAutoConfiguration#stringToZonedDateTimeConverter} 同款：
     * ISO-8601 时刻与 epoch 毫秒两种写法）。
     */
    private static ConversionService buildConversionService() {
        DefaultConversionService conversionService = new DefaultConversionService();
        conversionService.addConverter(new StringToZonedDateTimeConverter());
        return conversionService;
    }

    /** 支持的谓词名（诊断/管理面展示用）。 */
    public List<String> supportedPredicateNames() {
        return List.copyOf(factories.keySet());
    }

    /**
     * 定义串 → SCG 原生谓词。
     *
     * <p>失败分类（见类 javadoc）：</p>
     * <ul>
     *   <li>未知谓词名 / 名字不可知的语法坏 → 抛 {@link IllegalArgumentException}
     *       （调用方据此跳过该谓词，其余谓词照常生效）；</li>
     *   <li>已知谓词但缺必填参数 / 参数值非法 / 含 SpEL → 返回<b>恒不匹配</b>谓词
     *       + WARN（与 SCG「路由加载失败 → 不注册」效果等价）。</li>
     * </ul>
     *
     * @throws IllegalArgumentException 未知谓词名或无法识别的语法
     */
    public AsyncPredicate<ServerWebExchange> buildPredicate(String definition) {
        if (definition == null || definition.isBlank()) {
            throw new IllegalArgumentException("blank SCG route predicate definition");
        }
        String text = definition.trim();

        // 1) SCG 原生 shortcut 解析（name=value + 逗号切参）
        PredicateDefinition parsed;
        try {
            parsed = new PredicateDefinition(text);
        } catch (RuntimeException e) {
            // 语法坏（无 '=' 等）：若名字仍可恢复且是已知谓词 → 缺参（恒不匹配，
            // 对齐 SCG「路由加载失败 → 不注册」）；否则格式非法 → 跳过该谓词。
            String recovered = recoverName(text);
            if (factories.containsKey(recovered)) {
                return neverMatch(definition,
                        "no argument for SCG route predicate '" + recovered + "'");
            }
            throw new IllegalArgumentException(
                    "unparsable SCG route predicate definition: " + definition, e);
        }
        String name = parsed.getName() == null ? "" : parsed.getName().trim();
        RoutePredicateFactory<?> factory = factories.get(name);
        if (factory == null) {
            throw new IllegalArgumentException("unknown SCG route predicate: '" + name
                    + "' (supported: " + factories.keySet() + ")");
        }

        // 2) 禁止 SpEL：定义串来自数据库，不接受 #{...} 求值（fail-closed）
        for (String arg : parsed.getArgs().values()) {
            if (arg != null && arg.trim().startsWith("#{")) {
                return neverMatch(definition,
                        "SpEL expression is not allowed in a route predicate definition");
            }
        }

        // 3) SCG 原生 shortcut 归一化（GATHER_LIST / DEFAULT）
        Map<String, Object> normalized;
        try {
            normalized = factory.shortcutType().normalize(parsed.getArgs(), factory, spelParser, null);
        } catch (RuntimeException e) {
            return neverMatch(definition, "cannot be normalized: " + e.getMessage());
        }

        // 4) 必填参数齐备（对齐 SCG Config 上的 @NotEmpty/@NotNull 约束所覆盖的同名字段）
        String incomplete = findIncompleteArgument(factory, normalized);
        if (incomplete != null) {
            return neverMatch(definition, "missing required argument '" + incomplete + "'");
        }

        // 5) 绑定 Config + 应用 SCG 原生谓词
        return applyFactory(factory, normalized, parsed, definition);
    }

    /**
     * 批量构建。
     *
     * <p>两类失败语义不同（见类 javadoc）：</p>
     * <ul>
     *   <li><b>格式非法 / 未知谓词名</b> → 跳过该谓词 + WARN（其余谓词照常生效）；</li>
     *   <li><b>已知谓词但缺必填参数 / 参数值非法</b> → 该谓词恒不匹配 + WARN
     *       （与 SCG「路由加载失败 → 不注册」效果等价）。</li>
     * </ul>
     */
    public List<AsyncPredicate<ServerWebExchange>> buildPredicates(List<String> definitions) {
        if (definitions == null || definitions.isEmpty()) {
            return List.of();
        }
        List<AsyncPredicate<ServerWebExchange>> predicates = new ArrayList<>(definitions.size());
        for (String definition : definitions) {
            try {
                predicates.add(buildPredicate(definition));
            } catch (Exception e) {
                log.warn("Skip invalid SCG route predicate '{}': {}", definition, e.getMessage());
            }
        }
        return predicates;
    }

    /** 从定义串恢复谓词名（用于「无 '=' 」场景的分类：取第一个 '=' 之前的部分）。 */
    private static String recoverName(String text) {
        int eq = text.indexOf('=');
        if (eq > 0) {
            return text.substring(0, eq).trim();
        }
        if (eq < 0) {
            return text.trim();
        }
        return "";
    }

    /**
     * 恒不匹配谓词：已知谓词但定义串不完整/非法时使用。
     *
     * <p>语义与 SCG 等价：SCG 在 shortcut 绑定失败（{@code @NotEmpty}/{@code @NotNull}
     * 校验不通过）时让<b>整条路由加载失败 → 不注册 → 永不被匹配</b>；这里用「谓词恒
     * false」达到同一效果（AND 链短路 → 整条路由不匹配），但保留网关级 fail-safe
     * （不炸网关、不影响其它路由）。</p>
     */
    private AsyncPredicate<ServerWebExchange> neverMatch(String definition, String reason) {
        log.warn("SCG route predicate '{}' is invalid ({}): the route will never match "
                + "(aligned with SCG: invalid predicate → route not registered)", definition, reason);
        return NEVER_MATCH;
    }

    /**
     * 必填参数齐备性检查：shortcutFieldOrder() 声明的每个字段都必须在归一化结果里
     * 出现且非空（对齐 SCG 各 Config 上的 {@code @NotEmpty}/{@code @NotNull} 约束——
     * 两者覆盖的是同一批字段：patterns / methods / name / regexp / sources /
     * datetime / datetime1 / datetime2 / header / param）。
     *
     * @return 第一个缺失/为空的字段名；全部齐备时返回 null
     */
    private static String findIncompleteArgument(RoutePredicateFactory<?> factory, Map<String, Object> normalized) {
        for (String field : factory.shortcutFieldOrder()) {
            if (!normalized.containsKey(field)) {
                return field;
            }
            if (isBlankValue(normalized.get(field))) {
                return field;
            }
        }
        return null;
    }

    private static boolean isBlankValue(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof CharSequence sequence) {
            return sequence.toString().isBlank();
        }
        if (value instanceof Collection<?> collection) {
            return collection.isEmpty();
        }
        if (value instanceof Object[] array) {
            return array.length == 0;
        }
        return false;
    }

    private <C> AsyncPredicate<ServerWebExchange> applyFactory(RoutePredicateFactory<C> factory,
                                                               Map<String, Object> normalized,
                                                               PredicateDefinition parsed,
                                                               String definition) {
        C config;
        try {
            config = bind(factory, normalized, parsed);
        } catch (Exception e) {
            // 参数值非法（如 After=not-a-date）→ SCG 侧同样是路由加载失败 → 不注册
            return neverMatch(definition, "cannot be bound: " + e.getMessage());
        }
        return factory.applyAsync(config);
    }

    /**
     * Config 绑定：优先 SCG 自己的 ConfigurationService（与
     * {@code RouteDefinitionRouteLocator#lookup} 同款路径）；其不可用或抛错时退回内置
     * 绑定器（逐字复刻 {@code ConfigurationService.bindOrCreate}）。
     */
    private <C> C bind(RoutePredicateFactory<C> factory, Map<String, Object> normalized,
                        PredicateDefinition parsed) {
        if (configurationService != null) {
            try {
                return configurationService.with(factory)
                        .name(parsed.getName().trim())
                        .properties(parsed.getArgs())
                        .bind();
            } catch (Exception e) {
                log.debug("SCG ConfigurationService binding failed for predicate '{}', "
                        + "falling back to the built-in binder: {}", parsed.getName(), e.toString());
            }
        }
        return bindBuiltin(factory, normalized);
    }

    /** 内置绑定器：与 {@code ConfigurationService.bindOrCreate} 同口径。 */
    private <C> C bindBuiltin(RoutePredicateFactory<C> factory, Map<String, Object> normalized) {
        Bindable<C> bindable = Bindable.of(factory.getConfigClass());
        List<ConfigurationPropertySource> propertySources =
                Collections.singletonList(new MapConfigurationPropertySource(normalized));
        return new Binder(propertySources, null, conversionService)
                .bindOrCreate(factory.shortcutFieldPrefix(), bindable,
                        new IgnoreTopLevelConverterNotFoundBindHandler());
    }
}
