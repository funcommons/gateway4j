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

    @Test
    void loadedEventCarriesMaxConfigVersionAcrossRoutesAndPlugins() {
        List<fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent> events = new ArrayList<>();
        RouteDispatcher dispatcher = new RouteDispatcher(new RoutePathMatcher(), new RouteConditionMatcher());
        ApplicationEventPublisher publisher = event -> {
            if (event instanceof fun.commons.gateway4j.engine.config.event.ConfigLoadedEvent loaded) {
                events.add(loaded);
            }
        };
        ConfigService publishing = new ConfigService(new RouteConfigCache(), new PluginConfigCache(),
                dispatcher, publisher, () -> routes, () -> conditions, () -> plugins);

        routes.add(Route.builder().id(1L).routeType("BACKEND").path("/a")
                .configVersion(3L).status("PUBLISHED").build());
        routes.add(Route.builder().id(2L).routeType("BACKEND").path("/b")
                .configVersion(7L).status("PUBLISHED").build());
        plugins.add(Plugin.builder().id(1L).pluginId("security").pluginPhase("PRE")
                .scope("GLOBAL").status("ENABLED").sortOrder(1).configVersion(5L).build());
        // null config_version tolerated (treated as 0)
        plugins.add(Plugin.builder().id(2L).pluginId("metrics").pluginPhase("POST")
                .scope("GLOBAL").status("ENABLED").sortOrder(2).build());

        publishing.loadAllConfig();

        assertEquals(1, events.size());
        assertEquals(7L, events.get(0).getMaxConfigVersion(), "max over routes ∪ plugins");
    }

    // ==================== P2-2 多环境：按 gateway4j.env 装载过滤 ====================

    private Route publishedBackend(long id, String path, String environment) {
        Route r = Route.builder().id(id).routeType("BACKEND").path(path)
                .status("PUBLISHED").build();
        r.setEnvironment(environment);
        return r;
    }

    @Test
    void defaultEnvironmentLoadsNullEnvAndDefaultRowsOnly() {
        routes.add(publishedBackend(1L, "/null-env", null));
        routes.add(publishedBackend(2L, "/default-env", "default"));
        routes.add(publishedBackend(3L, "/staging-env", "staging"));

        configService.loadAllConfig();

        // null 环境视为 default（向后兼容），staging 隔离
        assertEquals(2, configService.getAllRoutes().size());
        assertNotNull(configService.getRoute(1L));
        assertNotNull(configService.getRoute(2L));
        assertNull(configService.getRoute(3L));
        assertEquals("default", configService.getEnvironment());
    }

    @Test
    void stagingEnvironmentIsolatesFromDefault() {
        routes.add(publishedBackend(1L, "/default-env", "default"));
        routes.add(publishedBackend(2L, "/staging-env", "staging"));
        routes.add(publishedBackend(3L, "/staging-draft", "staging")); // 非 PUBLISHED

        configService.setEnvironment("staging");
        configService.loadAllConfig();

        assertEquals(2, configService.getAllRoutes().size());
        assertNull(configService.getRoute(1L), "default 环境的路由不进 staging 网关");
        assertNotNull(configService.getRoute(2L));
    }

    @Test
    void blankEnvironmentNormalizesToDefault() {
        routes.add(publishedBackend(1L, "/blank-env", "  "));
        routes.add(publishedBackend(2L, "/x", "default"));

        configService.loadAllConfig();

        assertEquals(2, configService.getAllRoutes().size());
        assertNotNull(configService.getRoute(1L));
    }

    @Test
    void invalidEnvironmentFallsBackToDefault() {
        configService.setEnvironment("PROD_UPPER!");
        assertEquals("default", configService.getEnvironment(), "非法 env 回退 default（fail-open）");
    }

    @Test
    void blankEnvConfigFallsBackToDefault() {
        configService.setEnvironment("  ");
        assertEquals("default", configService.getEnvironment());
    }

    @Test
    void customEnvironmentNamesAccepted() {
        configService.setEnvironment("prod-01_a");
        assertEquals("prod-01_a", configService.getEnvironment());
    }

    @Test
    void springEnvironmentPropertyWiresEnv() {
        // 模拟 Spring 容器 EnvironmentAware 回调（@Bean 返回对象同样走此回调）
        org.springframework.core.env.Environment mock = new org.springframework.core.env.Environment() {
            @Override public String[] getActiveProfiles() { return new String[0]; }
            @Override public String[] getDefaultProfiles() { return new String[0]; }
            @Override public boolean acceptsProfiles(String... profiles) { return false; }
            @Override public boolean acceptsProfiles(org.springframework.core.env.Profiles profiles) { return false; }
            @Override public boolean containsProperty(String key) { return "gateway4j.env".equals(key); }
            @Override public String getProperty(String key) { return "gateway4j.env".equals(key) ? "staging" : null; }
            @Override public String getProperty(String key, String defaultValue) {
                String v = getProperty(key);
                return v != null ? v : defaultValue;
            }
            @Override public <T> T getProperty(String key, Class<T> targetType) { return null; }
            @Override public <T> T getProperty(String key, Class<T> targetType, T defaultValue) { return defaultValue; }
            @Override public String getRequiredProperty(String key) throws IllegalStateException {
                String v = getProperty(key);
                if (v == null) throw new IllegalStateException("required: " + key);
                return v;
            }
            @Override public <T> T getRequiredProperty(String key, Class<T> targetType) throws IllegalStateException {
                return targetType.cast(getRequiredProperty(key));
            }
            @Override public String resolvePlaceholders(String text) { return text; }
            @Override public String resolveRequiredPlaceholders(String text) throws IllegalArgumentException { return text; }
        };
        configService.setEnvironment(mock);
        assertEquals("staging", configService.getEnvironment(), "gateway4j.env 应经 EnvironmentAware 注入");
    }
}
