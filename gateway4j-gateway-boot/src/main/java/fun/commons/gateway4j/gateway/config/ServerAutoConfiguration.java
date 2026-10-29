package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.EngineAutoConfiguration;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.config.sync.ConfigPushHandler;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.locator.DynamicRouteLocator;
import fun.commons.gateway4j.plugin.builtins.cache.CachePlugin;
import fun.commons.gateway4j.plugin.builtins.logging.LoggingPlugin;
import fun.commons.gateway4j.plugin.builtins.mock.MockPlugin;
import fun.commons.gateway4j.plugin.builtins.ratelimit.RateLimitPlugin;
import fun.commons.gateway4j.plugin.builtins.security.SecurityPlugin;
import fun.commons.gateway4j.plugin.builtins.sharing.SharingPlugin;
import fun.commons.gateway4j.plugin.builtins.tracing.TracingPlugin;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Supplier;

@Configuration
@Import(EngineAutoConfiguration.class)
public class ServerAutoConfiguration {

    @Bean
    public RouteLocator dynamicRouteLocator(ConfigService configService) {
        return new DynamicRouteLocator(() -> {
            List<Route> routes = configService.getAllRoutes();
            return routes.stream().toList();
        });
    }

    @Bean
    public RouteConfigCache routeConfigCache() {
        return new RouteConfigCache();
    }

    @Bean
    public PluginConfigCache pluginConfigCache() {
        return new PluginConfigCache();
    }

    @Bean
    public ConfigService engineConfigService(RouteConfigCache routeConfigCache,
                                       PluginConfigCache pluginConfigCache,
                                       RouteDispatcher routeDispatcher,
                                       ApplicationEventPublisher eventPublisher,
                                       PluginInstanceRegistry pluginInstanceRegistry,
                                       RouteMapper routeMapper,
                                       RouteConditionMapper conditionMapper,
                                       RoutePluginBindingMapper bindingMapper,
                                       PluginMapper pluginMapper) {
        Supplier<List<Route>> routeLoader = () -> routeMapper.selectList(null);
        Supplier<List<RouteCondition>> conditionLoader = () -> conditionMapper.selectList(null);
        Supplier<List<Plugin>> pluginLoader = () -> pluginMapper.selectList(null);
        Supplier<List<RoutePluginBinding>> bindingLoader = () -> bindingMapper.selectList(null);
        return new ConfigService(routeConfigCache, pluginConfigCache,
                routeDispatcher, eventPublisher, routeLoader, conditionLoader, pluginLoader,
                bindingLoader, pluginInstanceRegistry);
    }

    /**
     * Runtime instances of the builtin plugins, keyed by their stable plugin_id
     * (BuiltinPluginConstants). GROOVY/JAR plugins and unknown plugin_ids have no
     * instance here and are skipped (fail-open) at execution time.
     *
     * <p>Every instance is inert until a matching ENABLED gw_plugin row pushes
     * config into it (PluginInstanceRegistry#applyPluginConfigs); instances
     * without a DB row never enter the plugin chain (composition is row-driven).
     * Instances needing external middleware (Kafka/ES/DingTalk) only build their
     * client when their config is enabled+complete, so registering them is
     * startup-safe even without the middleware present (fail-open).</p>
     */
    @Bean
    public PluginInstanceRegistry pluginInstanceRegistry(io.micrometer.core.instrument.MeterRegistry meterRegistry) {
        PluginInstanceRegistry registry = new PluginInstanceRegistry();

        // --- baseline (already registered before) ---
        registry.register(new SecurityPlugin());
        registry.register(new CachePlugin(false));
        registry.register(new CachePlugin(true));
        registry.register(new RateLimitPlugin());
        registry.register(new SharingPlugin(false));
        registry.register(new SharingPlugin(true));
        registry.register(new LoggingPlugin(false));
        registry.register(new LoggingPlugin(true));
        registry.register(new TracingPlugin(false));
        registry.register(new TracingPlugin(true));
        registry.register(new MockPlugin());

        // --- observability: feeds /v1/monitor/routes/status (requests.total / requests.errors) ---
        // PRE counts requests, POST records latency/final status and errors (incl.
        // forward failures, via the engine's gw4j:forwardError marker).
        fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin metricsPlugin =
                new fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin(false);
        metricsPlugin.setMeterRegistry(meterRegistry);
        registry.register(metricsPlugin);
        fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin metricsPostPlugin =
                new fun.commons.gateway4j.plugin.builtins.metrics.MetricsPlugin(true);
        metricsPostPlugin.setMeterRegistry(meterRegistry);
        registry.register(metricsPostPlugin);

        // --- traffic shaping: rewrite (path strip for dispatch sub-routes, consumed by PluginExecutionFilter) ---
        registry.register(new fun.commons.gateway4j.plugin.builtins.rewrite.RewritePlugin());

        // --- authentication / security ---
        registry.register(new fun.commons.gateway4j.plugin.builtins.jwt.JwtPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.keyauth.KeyAuthPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.basicauth.BasicAuthPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.sign.SignPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.waf.WafPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.oauth2.OAuth2Plugin());

        // --- fault tolerance ---
        registry.register(new fun.commons.gateway4j.plugin.builtins.circuitbreaker.CircuitBreakerPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.sentinel.SentinelPlugin());

        // --- traffic governance ---
        registry.register(new fun.commons.gateway4j.plugin.builtins.retry.RetryPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.redirect.RedirectPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.websocket.WebSocketPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.parammapping.ParamMappingPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.contextpath.ContextPathPlugin());

        // --- observability / rewriting (external-middleware ones stay fail-open) ---
        registry.register(new fun.commons.gateway4j.plugin.builtins.logging.kafka.LoggingKafkaPlugin(false));
        registry.register(new fun.commons.gateway4j.plugin.builtins.logging.kafka.LoggingKafkaPlugin(true));
        registry.register(new fun.commons.gateway4j.plugin.builtins.logging.elasticsearch.LoggingElasticsearchPlugin(false));
        registry.register(new fun.commons.gateway4j.plugin.builtins.logging.elasticsearch.LoggingElasticsearchPlugin(true));
        registry.register(new fun.commons.gateway4j.plugin.builtins.request.RequestPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.modifyresponse.ModifyResponsePlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.cryptor.CryptorRequestPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.cryptor.CryptorResponsePlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.dingtalk.DingTalkPlugin());
        registry.register(new fun.commons.gateway4j.plugin.builtins.watermark.WatermarkPlugin());

        return registry;
    }

    @Bean
    public org.springframework.beans.factory.SmartInitializingSingleton configInitializer(ConfigService configService) {
        return configService::loadAllConfig;
    }

    @Bean
    public ConfigSyncService configSyncService(RouteMapper routeMapper, PluginMapper pluginMapper) {
        return new ConfigSyncService(() -> configFingerprint(routeMapper, pluginMapper));
    }

    /**
     * Instant config-change channel (contract with admin publisher side): Redis
     * pub/sub channel {@code gateway4j:config:changed} triggers the existing
     * fingerprint-guarded reload; the 60s DB poll stays active as fallback.
     */
    @Bean
    public ConfigPushHandler configPushHandler(ConfigService configService, ConfigSyncService configSyncService) {
        return new ConfigPushHandler(configService, configSyncService);
    }

    @Bean
    public ConfigPushSubscriber configPushSubscriber(fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
                                                     ConfigPushHandler configPushHandler) {
        return new ConfigPushSubscriber(redisManager, configPushHandler);
    }

    /**
     * Mirrors the runtime plugin inventory (registered vs configured-but-skipped)
     * into Redis key {@code gateway4j:plugin:runtime} after every reload, for the
     * admin console display. Fail-open, TTL 10 minutes.
     */
    @Bean
    public PluginRuntimeCatalogPublisher pluginRuntimeCatalogPublisher(
            fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
            PluginInstanceRegistry pluginInstanceRegistry) {
        return new PluginRuntimeCatalogPublisher(redisManager, pluginInstanceRegistry);
    }

    /**
     * Mirrors this JVM's route metrics (the MetricsPlugin meters on the data
     * plane's own MeterRegistry) into Redis HASH {@code gateway4j:metrics:routes}
     * every 5s, so the admin console (a separate JVM with an empty local
     * registry) can render the monitor dashboard. Fail-open, EXPIRE 60 per write.
     */
    @Bean
    public MetricsSnapshotPublisher metricsSnapshotPublisher(
            fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
            io.micrometer.core.instrument.MeterRegistry meterRegistry) {
        return new MetricsSnapshotPublisher(redisManager, meterRegistry);
    }

    /**
     * framework4j MultiDataSourceAutoConfiguration 手动注册 SqlSessionFactory 时未把
     * MybatisPlusInterceptor 接入 plugins，这里在上下文就绪后补插，否则分页 total 恒为 0。
     */
    @Bean
    public org.springframework.beans.factory.SmartInitializingSingleton mybatisPlusInterceptorApplier(
            org.apache.ibatis.session.SqlSessionFactory sqlSessionFactory,
            com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor interceptor) {
        return () -> sqlSessionFactory.getConfiguration().addInterceptor(interceptor);
    }

    /**
     * Content fingerprint of the whole config set (routes ∪ plugins). Any insert,
     * publish/offline (config_version bump), row update (updated_at trigger) or
     * (logical) delete changes it, so the 30s poll always notices a change — the
     * former max(config_version) comparison missed a new route's first publish.
     */
    private static long configFingerprint(RouteMapper routeMapper, PluginMapper pluginMapper) {
        long hash = 17;
        for (Route route : routeMapper.selectList(null)) {
            hash = 31 * hash + nvl(route.getId());
            hash = 31 * hash + nvl(route.getConfigVersion());
            hash = 31 * hash + timeMicros(route.getUpdatedAt());
            hash = 31 * hash + safeHash(route.getStatus());
        }
        for (Plugin plugin : pluginMapper.selectList(null)) {
            hash = 31 * hash + nvl(plugin.getId());
            hash = 31 * hash + nvl(plugin.getConfigVersion());
            hash = 31 * hash + timeMicros(plugin.getUpdatedAt());
            hash = 31 * hash + safeHash(plugin.getStatus());
        }
        return hash;
    }

    private static long nvl(Long value) {
        return value != null ? value : 0L;
    }

    private static long timeMicros(OffsetDateTime time) {
        if (time == null) {
            return 0L;
        }
        java.time.Instant instant = time.toInstant();
        return instant.getEpochSecond() * 1_000_000L + instant.getNano() / 1_000L;
    }

    private static long safeHash(String value) {
        return value != null ? value.hashCode() : 0;
    }
}
