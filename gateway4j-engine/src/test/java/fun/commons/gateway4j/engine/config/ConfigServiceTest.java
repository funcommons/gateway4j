package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ConfigServiceTest {

    private ConfigService configService;
    private List<Route> routes;
    private List<RouteCondition> conditions;
    private List<Plugin> plugins;

    @BeforeEach
    void setUp() {
        routes = new ArrayList<>();
        conditions = new ArrayList<>();
        plugins = new ArrayList<>();

        RouteConfigCache routeCache = new RouteConfigCache();
        PluginConfigCache pluginCache = new PluginConfigCache();
        RouteDispatcher dispatcher = new RouteDispatcher(new RoutePathMatcher(), new RouteConditionMatcher());
        ApplicationEventPublisher publisher = event -> {};

        configService = new ConfigService(routeCache, pluginCache, dispatcher, publisher,
                () -> routes, () -> conditions, () -> plugins);
    }

    @Test
    void loadAllConfigPopulatesCaches() {
        routes.add(Route.builder().id(1L).routeType("BACKEND").path("/api/users").build());
        plugins.add(Plugin.builder().id(1L).pluginId("security").pluginPhase("PRE")
                .scope("GLOBAL").status("ENABLED").sortOrder(1).build());

        configService.loadAllConfig();

        assertNotNull(configService.getRoute(1L));
        assertNotNull(configService.getPlugin(1L));
        assertEquals(1, configService.getAllRoutes().size());
    }

    @Test
    void getMissingRouteReturnsNull() {
        assertNull(configService.getRoute(999L));
    }

    @Test
    void onConfigChangeReloadsRoutes() {
        routes.add(Route.builder().id(1L).routeType("BACKEND").path("/api/users").build());
        configService.loadAllConfig();
        assertNotNull(configService.getRoute(1L));

        routes.clear();
        ConfigChangeEvent event = new ConfigChangeEvent(this, "ROUTE", 1L, 2L, "UPDATE");
        configService.onConfigChange(event);

        assertNull(configService.getRoute(1L));
    }

    @Test
    void getGlobalPluginsByPhase() {
        plugins.add(Plugin.builder().id(1L).pluginPhase("PRE").scope("GLOBAL")
                .status("ENABLED").sortOrder(1).build());
        configService.loadAllConfig();

        assertEquals(1, configService.getGlobalPlugins("PRE").size());
        assertEquals(0, configService.getGlobalPlugins("POST").size());
    }
}
