package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.accesstoken.config.AccessTokenProperties;
import fun.commons.framework4j.accesstoken.core.AccessTokenGenerator;
import fun.commons.framework4j.accesstoken.util.TokenUtils;
import fun.commons.framework4j.redis.manager.MultiRedisManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * P2-7 SSE ?token= 校验单测：真实 TokenUtils 验签（与生产同一签名路径），
 * Redis 强一致 mock。
 */
@ExtendWith(MockitoExtension.class)
class SseTokenValidatorTest {

    private static final String SECRET = "unit-test-secret-key-0123456789abcdef";

    @Mock private AccessTokenGenerator generator;
    @Mock private ObjectProvider<MultiRedisManager> redisManagerProvider;
    @Mock private MultiRedisManager multiRedisManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ValueOperations<String, String> valueOperations;

    private SseTokenValidator validator;

    @BeforeEach
    void setUp() {
        AccessTokenProperties properties = new AccessTokenProperties();
        properties.setSecretKey(SECRET);
        validator = new SseTokenValidator(generator, properties, redisManagerProvider);
        lenient().when(redisManagerProvider.getIfAvailable()).thenReturn(multiRedisManager);
        lenient().when(multiRedisManager.getStringRedisTemplate("default")).thenReturn(stringRedisTemplate);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    /** 生成真实签名 token（type=BEARER，与登录链路 claim 同形）。 */
    private String token(String nonce, String hash, String jti) {
        long now = System.currentTimeMillis();
        return TokenUtils.createToken("BEARER", nonce, hash, "gateway4j",
                now, now + 600_000, jti, SECRET);
    }

    private void redisHoldsNonce(String nonce) {
        lenient().when(generator.buildRedisKey("BEARER", "h")).thenReturn("k:BEARER:h");
        lenient().when(valueOperations.get("k:BEARER:h"))
                .thenReturn("{\"nonce\":\"" + nonce + "\"}");
    }

    @Test
    void validTokenWithMatchingRedisNoncePasses() {
        lenient().when(generator.isRevoked(anyString())).thenReturn(false);
        redisHoldsNonce("n1");
        assertTrue(validator.validate(token("n1", "h", "j1")));
    }

    @Test
    void nonceMismatchRejected() {
        lenient().when(generator.isRevoked(anyString())).thenReturn(false);
        redisHoldsNonce("server-nonce");
        assertFalse(validator.validate(token("client-nonce", "h", "j1")));
    }

    @Test
    void revokedJtiRejected() {
        when(generator.isRevoked("j-revoked")).thenReturn(true);
        redisHoldsNonce("n1");
        assertFalse(validator.validate(token("n1", "h", "j-revoked")));
    }

    @Test
    void missingRedisEntryRejected() {
        lenient().when(generator.isRevoked(anyString())).thenReturn(false);
        when(generator.buildRedisKey("BEARER", "h")).thenReturn("k:BEARER:h");
        when(valueOperations.get("k:BEARER:h")).thenReturn(null);
        assertFalse(validator.validate(token("n1", "h", "j1")));
    }

    @Test
    void wrongTypeRejected() {
        long now = System.currentTimeMillis();
        String refreshToken = TokenUtils.createToken("refresh", "n", "h", "gateway4j",
                now, now + 600_000, "j", SECRET);
        assertFalse(validator.validate(refreshToken), "refresh token 不得接入 SSE");
    }

    @Test
    void tamperedSignatureRejected() {
        String good = token("n1", "h", "j1");
        assertFalse(validator.validate(good + "x"));
    }

    @Test
    void blankTokenRejected() {
        assertFalse(validator.validate(null));
        assertFalse(validator.validate(""));
    }

    @Test
    void redisAbsentFallsBackToSignatureOnly() {
        when(redisManagerProvider.getIfAvailable()).thenReturn(null);
        assertTrue(validator.validate(token("n1", "h", "j1")),
                "Redis 未装配（开发场景）退化纯验签");
    }

    @Test
    void validatorNeverThrows() {
        when(generator.isRevoked(anyString())).thenThrow(new RuntimeException("redis down"));
        assertDoesNotThrow(() -> validator.validate(token("n1", "h", "j1")));
        assertFalse(validator.validate(token("n1", "h", "j1")));
    }
}
