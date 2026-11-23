package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.engine.filter.DispatchRoutingFilter;
import fun.commons.gateway4j.engine.filter.PluginExecutionFilter;
import fun.commons.gateway4j.engine.filter.PluginResponseDecorationBridgeFilter;
import fun.commons.gateway4j.engine.metrics.InFlightRequestTracker;
import fun.commons.gateway4j.engine.plugin.metrics.PluginExecutionStats;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * S11a：第 5 参数为影子回放共享口令（{@code gateway4j.debug.shadow-token}，
     * 默认空 = 影子识别关闭）。admin 调试台以 {@code X-Gw4j-Shadow} 头携带同值
     * 口令，引擎据此豁免影子请求的 in-flight gauge 与插件级统计。
     */
    @Bean
    public PluginExecutionFilter pluginExecutionFilter(ConfigService configService,
                                                       PluginInstanceRegistry pluginInstanceRegistry,
                                                       InFlightRequestTracker inFlightRequestTracker,
                                                       PluginExecutionStats pluginExecutionStats,
                                                       @Value("${gateway4j.debug.shadow-token:}") String shadowToken) {
        return new PluginExecutionFilter(configService, pluginInstanceRegistry,
                inFlightRequestTracker, pluginExecutionStats, shadowToken);
    }

    /**
     * S11-4e 响应装饰晚绑定桥：order=-2（WRITE_RESPONSE_FILTER_ORDER-1，先于写过滤器
     * 被调），无条件把 response 换成透明晚绑定装饰器，使插件链运行时 PRE 插件置入
     * attributes 的装饰工厂在写回时才被解析应用——穿透 SCG NettyWriteResponseFilter
     * 写回闭包（写回闭包在插件链运行前已绑定原始 exchange，PRE 的 mutate().response()
     * 结构上不可达）。无工厂时逐字节透传，普通请求零影响。
     */
    @Bean
    public PluginResponseDecorationBridgeFilter pluginResponseDecorationBridgeFilter() {
        return new PluginResponseDecorationBridgeFilter();
    }
}
