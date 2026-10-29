package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.engine.filter.DispatchRoutingFilter;
import fun.commons.gateway4j.engine.filter.PluginExecutionFilter;
import fun.commons.gateway4j.engine.metrics.InFlightRequestTracker;
import fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SCG 桥接 bean（DispatchRoutingFilter / PluginExecutionFilter）。
 *
 * <p>这个配置类的方法签名引用了 Spring Cloud Gateway 类型（GlobalFilter 等）。
 * admin-boot 与 gateway-boot 共用 {@code fun.commons.gateway4j} 组件扫描，而
 * admin-boot（Servlet 栈）的 fat jar 里没有 spring-cloud-gateway——若把这两个
 * bean 放进 EngineAutoConfiguration，Spring 装配 admin 上下文时反射
 * introspect 该配置类即抛 NoClassDefFoundError，admin 直接无法启动。</p>
 *
 * <p>因此：① 与 EngineAutoConfiguration 拆分；② {@code @ConditionalOnClass} 用
 * 字符串形式，条件评估走 ASM，不需要加载本类引用的类型；③
 * {@code proxyBeanMethods = false} 使本类保持 lite 配置，无需 CGLIB 增强。
 * 类加载安全的原理：本类自身的签名只引用 engine 内类型（在 admin 类路径上存在），
 * Java 惰性解析保证不触发 DispatchRoutingFilter/PluginExecutionFilter 的加载
 * （它们的接口才是缺失的 GlobalFilter）。</p>
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass(name = "org.springframework.cloud.gateway.filter.GlobalFilter")
public class GatewayFilterBeansConfiguration {

    @Bean
    public DispatchRoutingFilter dispatchRoutingFilter(ConfigService configService,
                                                       RouteDispatcher routeDispatcher) {
        return new DispatchRoutingFilter(configService, routeDispatcher);
    }

    /**
     * P1-1 in-flight request gauge (per route path pattern bucket), read by the
     * gateway-boot MetricsSnapshotPublisher for the Redis snapshot's
     * {@code active} field. Plain object, admin-safe (no SCG types).
     */
    @Bean
    public InFlightRequestTracker inFlightRequestTracker() {
        return new InFlightRequestTracker();
    }

    /**
     * P1-2 plugin execution counters ({@code gateway4j_plugin_execution} meter +
     * runtime catalog {@code stats}). The MeterRegistry is optional: this bean
     * may also be created in the admin (Servlet) context where micrometer's
     * registry exists anyway, so wiring it is safe on both sides.
     */
    @Bean
    public PluginExecutionStats pluginExecutionStats(org.springframework.beans.factory.ObjectProvider<io.micrometer.core.instrument.MeterRegistry> meterRegistry) {
        return new PluginExecutionStats(meterRegistry.getIfAvailable());
    }

    @Bean
    public PluginExecutionFilter pluginExecutionFilter(ConfigService configService,
                                                       PluginInstanceRegistry pluginInstanceRegistry,
                                                       InFlightRequestTracker inFlightRequestTracker,
                                                       PluginExecutionStats pluginExecutionStats) {
        return new PluginExecutionFilter(configService, pluginInstanceRegistry,
                inFlightRequestTracker, pluginExecutionStats);
    }
}
