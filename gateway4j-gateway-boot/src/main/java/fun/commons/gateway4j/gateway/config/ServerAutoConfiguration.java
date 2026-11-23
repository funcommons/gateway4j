package fun.commons.gateway4j.gateway.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.mapper.RoutePredicateMapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.model.RoutePredicate;
import fun.commons.gateway4j.engine.config.ConfigService;
import fun.commons.gateway4j.engine.config.EngineAutoConfiguration;
import fun.commons.gateway4j.engine.config.cache.PluginConfigCache;
import fun.commons.gateway4j.engine.config.cache.RouteConfigCache;
import fun.commons.gateway4j.engine.config.cache.RoutePredicateCache;
import fun.commons.gateway4j.engine.config.sync.ConfigPushHandler;
import fun.commons.gateway4j.engine.config.sync.ConfigSyncService;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.locator.DynamicRouteLocator;
import fun.commons.gateway4j.engine.route.predicate.ScgRoutePredicateSupport;
import fun.commons.gateway4j.plugin.builtins.cache.CachePlugin;
import fun.commons.gateway4j.plugin.builtins.logging.LoggingPlugin;
import fun.commons.gateway4j.plugin.builtins.mock.MockPlugin;
import fun.commons.gateway4j.plugin.builtins.ratelimit.RateLimitPlugin;
import fun.commons.gateway4j.plugin.builtins.security.SecurityPlugin;
import fun.commons.gateway4j.plugin.builtins.sharing.SharingPlugin;
import fun.commons.gateway4j.plugin.builtins.tracing.TracingPlugin;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Supplier;

@Configuration
@Import(EngineAutoConfiguration.class)
public class ServerAutoConfiguration {

    @Bean
    public RouteLocator dynamicRouteLocator(ConfigService configService,
                                             ScgRoutePredicateSupport scgRoutePredicateSupport) {
        return new DynamicRouteLocator(() -> {
            List<Route> routes = configService.getAllRoutes();
            return routes.stream().toList();
        }, configService::getRoutePredicateDefinitions, scgRoutePredicateSupport);
    }

    /**
     * S12-1：路由级 SCG 原生谓词支持。
     *
     * <p>优先注入 SCG 自己的 {@code ConfigurationService}（走 SCG 原生 shortcut
     * 绑定，即 {@code RouteDefinitionRouteLocator#lookup} 同款路径）；该 bean 不可用
     * 时由 {@link ScgRoutePredicateSupport} 退回内置绑定器（逐字复刻 SCG 的
     * {@code ConfigurationService.bindOrCreate}）。</p>
     */
    @Bean
    public ScgRoutePredicateSupport scgRoutePredicateSupport(
            ObjectProvider<org.springframework.cloud.gateway.support.ConfigurationService> scgConfigurationService,
            Environment environment) {
        boolean hostIncludePort = environment.getProperty(
                "spring.cloud.gateway.server.webflux.predicate.host.include-port", Boolean.class, true);
        return new ScgRoutePredicateSupport(scgConfigurationService.getIfAvailable(), hostIncludePort);
    }

    @Bean
    public RouteConfigCache routeConfigCache() {
        return new RouteConfigCache();
    }

    @Bean
    public RoutePredicateCache routePredicateCache() {
        return new RoutePredicateCache();
    }

    @Bean
    public PluginConfigCache pluginConfigCache() {
        return new PluginConfigCache();
    }

    @Bean
    public ConfigService engineConfigService(RouteConfigCache routeConfigCache,
                                       PluginConfigCache pluginConfigCache,
                                       RoutePredicateCache routePredicateCache,
                                       RouteDispatcher routeDispatcher,
                                       ApplicationEventPublisher eventPublisher,
                                       PluginInstanceRegistry pluginInstanceRegistry,
                                       RouteMapper routeMapper,
                                       RouteConditionMapper conditionMapper,
                                       RoutePluginBindingMapper bindingMapper,
                                       RoutePredicateMapper routePredicateMapper,
                                       PluginMapper pluginMapper) {
        // S12-2（缺陷②）：路由取数带 ORDER BY id —— PostgreSQL 无 ORDER BY 的返回顺序不确定，
        // 会让「先注册者胜出」的 path 仲裁随部署漂移（DISPATCH 父路由可能被后置路由抢走入口）。
        Supplier<List<Route>> routeLoader = () -> routeMapper.selectList(
                new LambdaQueryWrapper<Route>().orderByAsc(Route::getId));
        Supplier<List<RouteCondition>> conditionLoader = () -> conditionMapper.selectList(null);
        Supplier<List<Plugin>> pluginLoader = () -> pluginMapper.selectList(null);
        Supplier<List<RoutePluginBinding>> bindingLoader = () -> bindingMapper.selectList(null);
        // S12-1：路由级 SCG 原生谓词行一次性取数（内存按 route_id 分组，禁 N+1）
        Supplier<List<RoutePredicate>> routePredicateLoader = () -> routePredicateMapper.selectList(null);
        return new ConfigService(routeConfigCache, pluginConfigCache, routePredicateCache,
                routeDispatcher, eventPublisher, routeLoader, conditionLoader, pluginLoader,
                bindingLoader, routePredicateLoader, pluginInstanceRegistry);
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
    public org.springframework.beans.factory.SmartInitializingSingleton configInitializer(
            ConfigService configService, ConfigSyncService configSyncService) {
        return () -> {
            // Seed the local content fingerprint BEFORE the first load, so the
            // sync-status publisher (gateway4j:config:sync) reports a real
            // fingerprint from the very first startup reload, not "0".
            try {
                configSyncService.checkVersion();
            } catch (Exception e) {
                // fail-open: fingerprint stays unknown; the 60s poll will seed it
            }
            configService.loadAllConfig();
        };
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
     * admin console display — with the optional per-plugin cumulative
     * {@code stats:{executed,skipped,error}} object (P1-2). Fail-open, TTL 10 minutes.
     */
    @Bean
    public PluginRuntimeCatalogPublisher pluginRuntimeCatalogPublisher(
            fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
            PluginInstanceRegistry pluginInstanceRegistry,
            fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats pluginExecutionStats) {
        return new PluginRuntimeCatalogPublisher(redisManager, pluginInstanceRegistry, pluginExecutionStats);
    }

    /**
     * Mirrors this JVM's route metrics (the MetricsPlugin meters on the data
     * plane's own MeterRegistry) into Redis HASH {@code gateway4j:metrics:routes}
     * every 5s, so the admin console (a separate JVM with an empty local
     * registry) can render the monitor dashboard. The in-flight tracker feeds
     * the snapshot's {@code active} field (P1-1). Fail-open, EXPIRE 60 per write.
     */
    @Bean
    public MetricsSnapshotPublisher metricsSnapshotPublisher(
            fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
            io.micrometer.core.instrument.MeterRegistry meterRegistry,
            fun.commons.gateway4j.engine.metrics.InFlightRequestTracker inFlightRequestTracker) {
        return new MetricsSnapshotPublisher(redisManager, meterRegistry, inFlightRequestTracker);
    }

    /**
     * Publishes the config sync status ({@code gateway4j:config:sync}, P1-3)
     * after every completed reload so the admin console can show whether the
     * data plane is serving the latest config. Fail-open, TTL 120s.
     */
    @Bean
    public ConfigSyncStatusPublisher configSyncStatusPublisher(
            fun.commons.framework4j.redis.manager.MultiRedisManager redisManager,
            ConfigSyncService configSyncService,
            org.springframework.core.env.Environment environment) {
        return new ConfigSyncStatusPublisher(redisManager, configSyncService, environment);
    }

    /**
     * v1.2.1 时代 framework4j 的 MultiDataSourceRegistrar 注册 SqlSessionFactory 时
     * 不接 MybatisPlusInterceptor 插件，导致分页 total 恒为 0，本补插应运而生。
     * framework4j v1.10.0 起工厂已通过 setPlugins(RuntimeBeanReference) 装配同一
     * 拦截器 bean，而 MyBatis InterceptorChain 无去重——再无条件补插会把
     * PaginationInnerInterceptor 注册两次，Page 查询被追加两个 LIMIT
     * （LIMIT ? LIMIT ? → PG syntax error → 10001 数据库操作异常）。
     * 因此按实例判等幂等补插：链上已有则跳过；老版本框架（未装配）时仍兜底生效。
     */
    @Bean
    public org.springframework.beans.factory.SmartInitializingSingleton mybatisPlusInterceptorApplier(
            org.apache.ibatis.session.SqlSessionFactory sqlSessionFactory,
            com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor interceptor) {
        return () -> {
            if (!sqlSessionFactory.getConfiguration().getInterceptors().contains(interceptor)) {
                sqlSessionFactory.getConfiguration().addInterceptor(interceptor);
            }
        };
    }

    // =========================================================================
    // --- 动态插件装载（ADR-003 第一阶段）：GROOVY 沙箱编译 / JAR 独立 ClassLoader ---
    // =========================================================================

    /**
     * Dynamic-plugin loader settings ({@code gateway4j.engine.plugin-loader.*}).
     */
    @Bean
    @org.springframework.boot.context.properties.ConfigurationProperties("gateway4j.engine.plugin-loader")
    public fun.commons.gateway4j.engine.plugin.loader.PluginLoaderProperties pluginLoaderProperties() {
        return new fun.commons.gateway4j.engine.plugin.loader.PluginLoaderProperties();
    }

    /**
     * Reconciles ENABLED GROOVY/JAR {@code gw_plugin} rows into the shared
     * {@link PluginInstanceRegistry} on every config reload: sandbox-compiles
     * {@code gw_plugin_groovy} scripts, SPI-validates and loads the uploaded jars
     * from the admin-side storage (read-only) with an isolated classloader each,
     * closes the old classloader BEFORE a replacement is built (ADR-003 Metaspace
     * guard) and unregisters+unloads disabled/removed rows. Compile/validation
     * failures are fail-closed per row: ERROR log, no instance → the data plane
     * counts the row as {@code skipped} per request.
     */
    @Bean
    public fun.commons.gateway4j.engine.plugin.loader.DynamicPluginLoader dynamicPluginLoader(
            PluginInstanceRegistry pluginInstanceRegistry,
            fun.commons.gateway4j.common.mapper.GroovyMapper groovyMapper,
            fun.commons.gateway4j.common.mapper.PluginJarFileMapper pluginJarFileMapper,
            fun.commons.gateway4j.engine.plugin.loader.PluginLoaderProperties pluginLoaderProperties) {
        return new fun.commons.gateway4j.engine.plugin.loader.DynamicPluginLoader(
                pluginInstanceRegistry,
                new fun.commons.gateway4j.engine.plugin.loader.GroovyPluginLoader(),
                new fun.commons.gateway4j.engine.plugin.loader.JarPluginLoader(
                        pluginLoaderProperties.getJarParentPackages()),
                () -> groovyMapper.selectList(null),
                () -> pluginJarFileMapper.selectList(null),
                java.time.Duration.ofMillis(pluginLoaderProperties.getExecTimeoutMs()));
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
