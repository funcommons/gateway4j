package fun.commons.gateway4j.engine.config;

import fun.commons.gateway4j.engine.plugin.chain.PluginChainFactory;
import fun.commons.gateway4j.engine.route.dispatcher.RouteDispatcher;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 引擎核心 bean。注意：本类会被 admin-boot（Servlet，无 spring-cloud-gateway）
 * 与 gateway-boot（Reactive）共同组件扫描装载，因此这里**禁止出现任何
 * Spring Cloud Gateway / reactive 类型签名**——引用 SCG 类型的 bean 全部放在
 * {@link GatewayFilterBeansConfiguration}（@ConditionalOnClass 守卫）。
 */
@Configuration
@EnableConfigurationProperties(EngineProperties.class)
public class EngineAutoConfiguration {

    @Bean
    public RoutePathMatcher routePathMatcher() {
        return new RoutePathMatcher();
    }

    @Bean
    public RouteConditionMatcher routeConditionMatcher() {
        return new RouteConditionMatcher();
    }

    @Bean
    public RouteDispatcher routeDispatcher(RoutePathMatcher pathMatcher,
                                            RouteConditionMatcher conditionMatcher) {
        return new RouteDispatcher(pathMatcher, conditionMatcher);
    }

    @Bean
    public RouteValidator routeValidator() {
        return new RouteValidator();
    }

    @Bean
    public PluginChainFactory pluginChainFactory() {
        return new PluginChainFactory();
    }

    // NOTE: PluginInstanceRegistry is intentionally NOT defined here. The empty
    // default would (bean-name) override the assembly's populated registry
    // (gateway-boot registers the builtin plugin instances); assemblies must
    // provide the bean themselves.
}
