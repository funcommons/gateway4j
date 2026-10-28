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
     * framework4j MultiDataSourceAutoConfiguration 手动注册 SqlSessionFactory 时未把
     * MybatisPlusInterceptor 接入 plugins，这里在上下文就绪后补插，否则分页 total 恒为 0。
     */
    @Bean
    public org.springframework.beans.factory.SmartInitializingSingleton mybatisPlusInterceptorApplier(
            org.apache.ibatis.session.SqlSessionFactory sqlSessionFactory,
            com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor interceptor) {
        return () -> sqlSessionFactory.getConfiguration().addInterceptor(interceptor);
    }
}
