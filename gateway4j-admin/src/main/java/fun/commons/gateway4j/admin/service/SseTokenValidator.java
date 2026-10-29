package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.accesstoken.config.AccessTokenProperties;
import fun.commons.framework4j.accesstoken.core.AccessTokenGenerator;
import fun.commons.framework4j.accesstoken.util.TokenUtils;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Map;

/**
 * SSE 专用的 ?token= 查询参数校验（P2-7）。
 *
 * <p><b>为什么不用 @RequiresToken 拦截器</b>：EventSource 不能携带 Authorization
 * 请求头，框架 TokenInterceptor 只从 Header 取 token——SSE 路径必须走查询参数。
 * 校验逻辑与 {@code AccessTokenValidationStrategy} 同源收紧：</p>
 * <ol>
 *   <li>TokenUtils.parseToken 验签 + exp（HS256 单 key）；</li>
 *   <li>type 必须 = BEARER；</li>
 *   <li>jti 撤销检查（generator.isRevoked）；</li>
 *   <li>Redis 强一致：key 存在 + nonce 匹配（防别处登录后的旧 token 复用）。</li>
 * </ol>
 *
 * <p><b>安全取舍</b>：token 进 URL 会进访问日志/代理日志——本端点只读监控指标
 * （routes/status 摘要 + 配置变更通知），泄露面 = 匿名可看的聚合数字，且 token
 * 短时效（2h）+ Redis 强一致可撤销；管理面内网场景可接受。生产如需更强约束，
 * 反向代理层过滤 /stream 的 query-string 日志即可。</p>
 */
@Slf4j
@Component
public class SseTokenValidator {

    private final AccessTokenGenerator generator;
    private final AccessTokenProperties properties;
    private final ObjectProvider<MultiRedisManager> redisManagers;

    public SseTokenValidator(AccessTokenGenerator generator,
                             AccessTokenProperties properties,
                             ObjectProvider<MultiRedisManager> redisManagers) {
        this.generator = generator;
        this.properties = properties;
        this.redisManagers = redisManagers;
    }

    /** 校验通过返回 true；任何失败（签名/exp/撤销/Redis 不一致）一律 false。 */
    public boolean validate(String token) {
        if (!StringUtils.hasText(token)) {
            return false;
        }
        try {
            Map<String, Object> payload = TokenUtils.parseToken(token, properties.getSecretKey());

            String type = (String) payload.get("type");
            if (!"BEARER".equals(type)) {
                return false;
            }
            String jti = (String) payload.get("jti");
            if (jti != null && generator.isRevoked(jti)) {
                return false;
            }
            MultiRedisManager redis = redisManagers.getIfAvailable();
            if (redis == null) {
                // Redis 未装配时 Redis 强一致做不了，退化为纯验签（开发场景兜底）
                log.debug("[SSE] MultiRedisManager 未装配，仅验签通过即放行");
                return true;
            }
            String hash = (String) payload.get("hash");
            String nonce = (String) payload.get("nonce");
            StringRedisTemplate template = redis.getStringRedisTemplate("default");
            String value = template.opsForValue().get(generator.buildRedisKey(type, hash));
            if (!StringUtils.hasText(value)) {
                return false;
            }
            Map<?, ?> data = TokenUtils.MAPPER.readValue(value, Map.class);
            Object serverNonce = data.get("nonce");
            return nonce != null && nonce.equals(serverNonce);
        } catch (Exception e) {
            // 验签失败/过期/格式错/Redis 异常 → 一律拒绝且不泄露原因差异
            return false;
        }
    }
}
