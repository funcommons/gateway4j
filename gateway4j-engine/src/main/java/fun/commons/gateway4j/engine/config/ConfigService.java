package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
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

public class ConfigService {

    private static final Logger log = LoggerFactory.getLogger(ConfigService.class);

    private static final String STATUS_PUBLISHED = "PUBLISHED";

    private final RouteConfigCache routeCache;
    private final PluginConfigCache pluginCache;
    private final RouteDispatcher routeDispatcher;
    private final ApplicationEventPublisher eventPublisher;
    private final Supplier<List<Route>> routeLoader;
    private final Supplier<List<RouteCondition>> conditionLoader;
    private final Supplier<List<Plugin>> pluginLoader;
    private final Supplier<List<RoutePluginBinding>> bindingLoader;
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
        this.routeCache = routeCache;
        this.pluginCache = pluginCache;
        this.routeDispatcher = routeDispatcher;
        this.eventPublisher = eventPublisher;
        this.routeLoader = routeLoader;
        this.conditionLoader = conditionLoader;
        this.pluginLoader = pluginLoader;
        this.bindingLoader = bindingLoader;
        this.pluginRegistry = pluginRegistry;
    }

    public void loadAllConfig() {
        List<Route> routes = routeLoader.get();
        List<RouteCondition> conditions = conditionLoader.get();
        List<Plugin> plugins = pluginLoader.get();
        List<RoutePluginBinding> bindings = bindingLoader.get();

        routeCache.refreshAll(routes);
        pluginCache.refreshAll(plugins);
        // Push persisted plugin config into runtime plugin instances (fail-open per plugin).
        pluginRegistry.applyPluginConfigs(plugins);

        // The data plane (dispatcher path/condition matching + SCG registration via
        // DynamicRouteLocator's supplier) only ever serves PUBLISHED routes.
        List<Route> publishedRoutes = routes.stream()
                .filter(r -> STATUS_PUBLISHED.equals(r.getStatus()))
                .toList();
        routeDispatcher.updateRoutes(publishedRoutes, conditions);

        this.bindings = bindings == null ? List.of() : bindings;

        log.info("Config loaded: routes={} (published={}), conditions={}, plugins={}, bindings={}",
                routes.size(), publishedRoutes.size(), conditions.size(), plugins.size(), this.bindings.size());
        eventPublisher.publishEvent(new fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent(this, plugins));
        eventPublisher.publishEvent(new org.springframework.cloud.gateway.event.RefreshRoutesEvent(this));
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
