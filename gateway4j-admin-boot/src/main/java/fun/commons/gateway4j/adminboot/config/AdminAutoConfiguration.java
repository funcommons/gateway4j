package fun.commons.gateway4j.adminboot.config;

import fun.commons.framework4j.signature.service.InMemorySecretProvider;
import fun.commons.framework4j.signature.service.SecretProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

/**
 * 管理后台开放 API 签名认证的 appKey → appSecret 凭证源。
 * 生产环境应替换为 DB 或配置中心实现（SecretProvider 接口）。
 */
@Configuration
public class AdminAutoConfiguration {

    @Value("${gateway4j.open-api.app-key:gateway4j-open}")
    private String appKey;

    @Value("${gateway4j.open-api.app-secret:change-me-in-production}")
    private String appSecret;

    @Bean
    public SecretProvider secretProvider() {
        Map<String, String> credentials = new HashMap<>();
        credentials.put(appKey, appSecret);
        return new InMemorySecretProvider(credentials);
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
}
