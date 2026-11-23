package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RouteFilter;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.model.RoutePredicate;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteFilterCache;
import fun.commons.gateway4j.engine.config.cache.RoutePredicateCache;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;

import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;
import java.util.regex.Pattern;

public class ConfigService implements org.springframework.context.EnvironmentAware {

    private static final Logger log = LoggerFactory.getLogger(ConfigService.class);

    private static final String STATUS_PUBLISHED = "PUBLISHED";

    /** P2-2 多环境：数据面环境标识配置项（{@code gateway4j.env}，缺省 default）。 */
    public static final String ENV_PROPERTY = "gateway4j.env";

    private static final Pattern ENV_PATTERN = Pattern.compile(Route.ENVIRONMENT_PATTERN);

    /** 当前数据面环境（volatile：loadAllConfig 与请求线程并发读）。 */
    private volatile String environment = Route.DEFAULT_ENVIRONMENT;

    private final RouteConfigCache routeCache;
    private final PluginConfigCache pluginCache;
    private final RoutePredicateCache routePredicateCache;
    private final RouteFilterCache routeFilterCache;
    private final RouteDispatcher routeDispatcher;
    private final ApplicationEventPublisher eventPublisher;
    private final Supplier<List<Route>> routeLoader;
    private final Supplier<List<RouteCondition>> conditionLoader;
    private final Supplier<List<Plugin>> pluginLoader;
    private final Supplier<List<RoutePluginBinding>> bindingLoader;
    private final Supplier<List<RoutePredicate>> routePredicateLoader;
    private final Supplier<List<RouteFilter>> routeFilterLoader;
    private final PluginInstanceRegistry pluginRegistry;
    private volatile List<RoutePluginBinding> bindings = List.of();

    public ConfigService(RouteConfigCache routeCache, PluginConfigCache pluginCache,
                         RouteDispatcher routeDispatcher, ApplicationEventPublisher eventPublisher,
                         Supplier<List<Route>> routeLoader, Supplier<List<RouteCondition>> conditionLoader,
                         Supplier<List<Plugin>> pluginLoader) {
        this(routeCache, pluginCache, routeDispatcher, eventPublisher, routeLoader,
                conditionLoader, pluginLoader, () -> List.of(), new PluginInstanceRegistry());
    }

    public ConfigService(RouteConfigCache routeCache, PluginConfigCache pluginCache,
                         RouteDispatcher routeDispatcher, ApplicationEventPublisher eventPublisher,
                         Supplier<List<Route>> routeLoader, Supplier<List<RouteCondition>> conditionLoader,
                         Supplier<List<Plugin>> pluginLoader,
                         Supplier<List<RoutePluginBinding>> bindingLoader,
                         PluginInstanceRegistry pluginRegistry) {
        this(routeCache, pluginCache, new RoutePredicateCache(), routeDispatcher, eventPublisher,
                routeLoader, conditionLoader, pluginLoader, bindingLoader, () -> List.of(), pluginRegistry);
    }

    /**
     * S12-1 形态构造器（无 filter 装配）：S12-7a 起委托全参构造——
     * filter 缓存/装载缺省为空，行为与 S12-1 完全一致（老调用点零改动）。
     */
    public ConfigService(RouteConfigCache routeCache, PluginConfigCache pluginCache,
                         RoutePredicateCache routePredicateCache,
                         RouteDispatcher routeDispatcher, ApplicationEventPublisher eventPublisher,
                         Supplier<List<Route>> routeLoader, Supplier<List<RouteCondition>> conditionLoader,
                         Supplier<List<Plugin>> pluginLoader,
                         Supplier<List<RoutePluginBinding>> bindingLoader,
                         Supplier<List<RoutePredicate>> routePredicateLoader,
                         PluginInstanceRegistry pluginRegistry) {
        this(routeCache, pluginCache, routePredicateCache, new RouteFilterCache(), routeDispatcher,
                eventPublisher, routeLoader, conditionLoader, pluginLoader, bindingLoader,
                routePredicateLoader, () -> List.of(), pluginRegistry);
    }

    /**
     * S12-1 起新增 {@code routePredicateCache} / {@code routePredicateLoader}：
     * 路由级 SCG 原生谓词行（gw_route_predicate）一次性取数后按 route_id 内存分组。
     * S12-7a 起新增 {@code routeFilterCache} / {@code routeFilterLoader}：
     * 路由级 SCG 原生 filter 行（gw_route_filter），同款取数口径。
     */
    public ConfigService(RouteConfigCache routeCache, PluginConfigCache pluginCache,
                         RoutePredicateCache routePredicateCache, RouteFilterCache routeFilterCache,
                         RouteDispatcher routeDispatcher, ApplicationEventPublisher eventPublisher,
                         Supplier<List<Route>> routeLoader, Supplier<List<RouteCondition>> conditionLoader,
                         Supplier<List<Plugin>> pluginLoader,
                         Supplier<List<RoutePluginBinding>> bindingLoader,
                         Supplier<List<RoutePredicate>> routePredicateLoader,
                         Supplier<List<RouteFilter>> routeFilterLoader,
                         PluginInstanceRegistry pluginRegistry) {
        this.routeCache = routeCache;
        this.pluginCache = pluginCache;
        this.routePredicateCache = routePredicateCache == null ? new RoutePredicateCache() : routePredicateCache;
        this.routeFilterCache = routeFilterCache == null ? new RouteFilterCache() : routeFilterCache;
        this.routeDispatcher = routeDispatcher;
        this.eventPublisher = eventPublisher;
        this.routeLoader = routeLoader;
        this.conditionLoader = conditionLoader;
        this.pluginLoader = pluginLoader;
        this.bindingLoader = bindingLoader;
        this.routePredicateLoader = routePredicateLoader;
        this.routeFilterLoader = routeFilterLoader;
        this.pluginRegistry = pluginRegistry;
    }

    public void loadAllConfig() {
        List<Route> routes = routeLoader.get();
        List<RouteCondition> conditions = conditionLoader.get();
        List<Plugin> plugins = pluginLoader.get();
        List<RoutePluginBinding> bindings = bindingLoader.get();

        // P2-2 多环境：装载查询按当前 environment 过滤（等效 SQL 侧
        // WHERE environment = ?，单 env 部署全部行为 'default'，零行为变化）。
        List<Route> envRoutes = filterByEnvironment(routes);
        routeCache.refreshAll(envRoutes);
        pluginCache.refreshAll(plugins);
        routePredicateCache.refreshAll(loadRoutePredicates());
        routeFilterCache.refreshAll(loadRouteFilters());
        // Push persisted plugin config into runtime plugin instances (fail-open per plugin).
        pluginRegistry.applyPluginConfigs(plugins);

        // The data plane (dispatcher path/condition matching + SCG registration via
        // DynamicRouteLocator's supplier) only ever serves PUBLISHED routes.
        List<Route> publishedRoutes = envRoutes.stream()
                .filter(r -> STATUS_PUBLISHED.equals(r.getStatus()))
                .toList();
        routeDispatcher.updateRoutes(publishedRoutes, conditions);

        this.bindings = bindings == null ? List.of() : bindings;

        log.info("Config loaded: environment={}, routes={} (published={}), conditions={}, plugins={}, bindings={}, routePredicates={}, routeFilters={}",
                environment, envRoutes.size(), publishedRoutes.size(), conditions.size(), plugins.size(),
                this.bindings.size(), routePredicateCache.size(), routeFilterCache.size());
        eventPublisher.publishEvent(new fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent(
                this, plugins, maxConfigVersion(envRoutes, plugins)));
        eventPublisher.publishEvent(new org.springframework.cloud.gateway.event.RefreshRoutesEvent(this));
    }

    /**
     * S12-1：装载路由级 SCG 原生谓词行。
     *
     * <p>fail-safe：gw_route_predicate 表尚未由迁移脚本建出（管理面未升级）时，
     * 取数失败只降级为「无谓词」，绝不拖垮整个配置装载。</p>
     */
    private List<RoutePredicate> loadRoutePredicates() {
        if (routePredicateLoader == null) {
            return List.of();
        }
        try {
            List<RoutePredicate> predicates = routePredicateLoader.get();
            return predicates == null ? List.of() : predicates;
        } catch (Exception e) {
            log.warn("Load route predicates failed (gw_route_predicate unavailable?), "
                    + "continuing without route-level SCG predicates: {}", e.getMessage());
            return List.of();
        }
    }

    /** S12-1：某路由携带的 SCG 原生谓词定义串（按 sort_order 升序）。 */
    public List<String> getRoutePredicateDefinitions(Long routeId) {
        return routePredicateCache.getDefinitions(routeId);
    }

    /**
     * S12-7a：装载路由级 SCG 原生 filter 行。
     *
     * <p>fail-safe：gw_route_filter 表尚未由迁移脚本建出（管理面未升级）时，
     * 取数失败只降级为「无 filter」，绝不拖垮整个配置装载。</p>
     */
    private List<RouteFilter> loadRouteFilters() {
        if (routeFilterLoader == null) {
            return List.of();
        }
        try {
            List<RouteFilter> filters = routeFilterLoader.get();
            return filters == null ? List.of() : filters;
        } catch (Exception e) {
            log.warn("Load route filters failed (gw_route_filter unavailable?), "
                    + "continuing without route-level SCG filters: {}", e.getMessage());
            return List.of();
        }
    }

    /** S12-7a：某路由携带的 SCG 原生 filter 定义串（按 sort_order 升序）。 */
    public List<String> getRouteFilterDefinitions(Long routeId) {
        return routeFilterCache.getDefinitions(routeId);
    }

    /**
     * P2-2 多环境：把装载到的路由行按当前 environment 过滤。
     *
     * <p>environment 为 null/blank 的行（迁移前的存量数据、旧客户端写入）视为
     * {@link Route#DEFAULT_ENVIRONMENT}，保证向后兼容；其他环境的行不进缓存、
     * 不进分发器，本环境的 gateway 完全无感。</p>
     */
    private List<Route> filterByEnvironment(List<Route> routes) {
        if (routes == null) {
            return List.of();
        }
        String env = this.environment;
        return routes.stream()
                .filter(r -> env.equals(environmentOf(r)))
                .toList();
    }

    /** 路由行的有效环境：null/blank 归一为 default（向后兼容；口径在 common，admin/engine 共用）。 */
    public static String environmentOf(Route route) {
        return route == null ? Route.DEFAULT_ENVIRONMENT : Route.environmentOr(route.getEnvironment());
    }

    /**
     * Spring 装配回调：从 {@code gateway4j.env} 读取环境标识（缺省 default）。
     * 仅 Spring 容器创建的实例会触发（@Bean 返回对象同样走 Aware 回调）；
     * 直接 new 的实例保持 default，可用 {@link #setEnvironment(String)} 显式指定。
     */
    @Override
    public void setEnvironment(org.springframework.core.env.Environment springEnvironment) {
        String configured = springEnvironment.getProperty(ENV_PROPERTY, Route.DEFAULT_ENVIRONMENT);
        applyEnvironment(configured);
    }

    /** 显式指定数据面环境（测试 / 非容器装配用）；非法值告警并回退 default（fail-open）。 */
    public void setEnvironment(String environment) {
        applyEnvironment(environment);
    }

    private void applyEnvironment(String configured) {
        if (configured == null || configured.isBlank()) {
            this.environment = Route.DEFAULT_ENVIRONMENT;
            return;
        }
        String trimmed = configured.trim();
        if (!ENV_PATTERN.matcher(trimmed).matches()) {
            log.warn("Invalid {} '{}' (expected {}), falling back to '{}'",
                    ENV_PROPERTY, configured, Route.ENVIRONMENT_PATTERN, Route.DEFAULT_ENVIRONMENT);
            this.environment = Route.DEFAULT_ENVIRONMENT;
            return;
        }
        this.environment = trimmed;
    }

    /** 当前数据面环境标识（恒非 null，已按白名单校验）。 */
    public String getEnvironment() {
        return environment;
    }


    /** Max config_version over the loaded route + plugin rows (P1-3 sync-status "version"). */
    static long maxConfigVersion(List<Route> routes, List<Plugin> plugins) {
        long max = 0;
        if (routes != null) {
            for (Route route : routes) {
                if (route != null && route.getConfigVersion() != null) {
                    max = Math.max(max, route.getConfigVersion());
                }
            }
        }
        if (plugins != null) {
            for (Plugin plugin : plugins) {
                if (plugin != null && plugin.getConfigVersion() != null) {
                    max = Math.max(max, plugin.getConfigVersion());
                }
            }
        }
        return max;
    }

    public Route getRoute(Long id) {
        return routeCache.getRoute(id);
    }

    public Plugin getPlugin(Long id) {
        return pluginCache.getPlugin(id);
    }

    public List<Route> getAllRoutes() {
        return routeCache.getAllRoutes();
    }

    public boolean isDispatchRoute(Long routeId) {
        if (routeId == null) {
            return false;
        }
        Route route = routeCache.getRoute(routeId);
        return route != null && "DISPATCH".equals(route.getRouteType());
    }

    public List<Plugin> getGlobalPlugins(String phase) {
        return pluginCache.getGlobalPlugins(phase);
    }

    /** Enabled plugin rows bound to the given route, ordered by binding sort_order. */
    public List<Plugin> getRouteBoundPluginRows(Long routeId) {
        if (routeId == null) {
            return List.of();
        }
        return bindings.stream()
                .filter(b -> routeId.equals(b.getRouteId()))
                .sorted(Comparator.comparing(b -> b.getSortOrder() != null ? b.getSortOrder() : 0))
                .map(b -> pluginCache.getPlugin(b.getPluginId()))
                .filter(p -> p != null && "ENABLED".equals(p.getStatus()))
                .toList();
    }

    @EventListener
    public void onConfigChange(ConfigChangeEvent event) {
        switch (event.getConfigType()) {
            case "ROUTE" -> handleRouteChange(event);
            case "PLUGIN" -> handlePluginChange(event);
            case "GLOBAL_PLUGIN" -> handleGlobalPluginChange(event);
        }
    }

    private void handleRouteChange(ConfigChangeEvent event) {
        routeCache.invalidateRoute(event.getConfigId());
        loadAllConfig();
    }

    private void handlePluginChange(ConfigChangeEvent event) {
        pluginCache.invalidatePlugin(event.getConfigId());
        loadAllConfig();
    }

    private void handleGlobalPluginChange(ConfigChangeEvent event) {
        loadAllConfig();
    }
}
