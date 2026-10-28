package fun.commons.gateway4j.gateway.config;

import fun.commons.framework4j.signature.service.InMemorySecretProvider;
import fun.commons.framework4j.signature.service.SecretProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

/**
 * 开放 API 签名认证的 appKey → appSecret 凭证源。
 * 生产环境应替换为 DB 或配置中心实现（SecretProvider 接口）。
 */
@Configuration
public class OpenApiConfig {

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
}
