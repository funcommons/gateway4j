package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.core.AccessTokenGenerator.TokenPair;
import fun.commons.framework4j.accesstoken.core.RefreshTokenService;
import fun.commons.gateway4j.admin.service.AuthService;
import fun.commons.gateway4j.common.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock private AuthService authService;
    @Mock private RefreshTokenService refreshTokenService;
    @Mock private fun.commons.gateway4j.admin.service.WeakPasswordDetector weakPasswordDetector;
    @InjectMocks private AuthController controller;

    @Test
    void login() {
        User user = User.builder().id(1L).username("admin").realName("管理员").build();
        when(authService.authenticate("admin", "pass")).thenReturn(user);
        when(authService.getUserRoleCodes(1L)).thenReturn(List.of("ROLE_ADMIN"));
        when(refreshTokenService.generateTokenPair(anyMap()))
                .thenReturn(new TokenPair("at-123", "rt-456", "fam-1", 7200, 2592000));
        when(weakPasswordDetector.isPasswordStale(user)).thenReturn(false);

        Map<String, Object> result = controller.login(new AuthController.LoginRequest("admin", "pass"));
        assertEquals("1", result.get("user_id"));
        assertEquals("admin", result.get("username"));
        assertEquals(List.of("ROLE_ADMIN"), result.get("roles"));
        assertEquals("at-123", result.get("access_token"));
        assertEquals("rt-456", result.get("refresh_token"));
        assertEquals(7200L, result.get("expires_in"));
        // P2-9：弱口令提示位（非阻断，仅随登录响应平铺返回）
        assertEquals(false, result.get("password_stale"));
    }

    @Test
    void loginFlagsSeedWeakPassword() {
        // P2-9：出厂种子口令用户登录 → password_stale=true（提示，不阻断）
        User stale = User.builder().id(1L).username("admin")
                .password("$2y$10$QU2Ak2ITzyVjcBiGBM7ks.R6iNZshmePa8e2TETpKjJ.XHBAZJ8ym")
                .realName("管理员").build();
        when(authService.authenticate("admin", "admin123")).thenReturn(stale);
        when(authService.getUserRoleCodes(1L)).thenReturn(List.of("ROLE_ADMIN"));
        when(refreshTokenService.generateTokenPair(anyMap()))
                .thenReturn(new TokenPair("at-1", "rt-1", "fam-1", 7200, 2592000));
        when(weakPasswordDetector.isPasswordStale(stale)).thenReturn(true);

        Map<String, Object> result = controller.login(new AuthController.LoginRequest("admin", "admin123"));
        assertEquals(Boolean.TRUE, result.get("password_stale"));
    }

    @Test
    void refresh() {
        when(refreshTokenService.refreshAccessToken("rt-456"))
                .thenReturn(new TokenPair("at-new", "rt-new", "fam-1", 7200, 2592000));
        Map<String, Object> result = controller.refresh(new AuthController.RefreshRequest("rt-456"));
        assertEquals("at-new", result.get("access_token"));
        assertEquals("rt-new", result.get("refresh_token"));
    }

    @Test
    void loginHasSelfProtectionRateLimit() throws Exception {
        // T3：登录接口必须带 IP 维度 10 次/分钟限流，防口令爆破；注解被误删时此用例失败
        var annotation = AuthController.class
                .getDeclaredMethod("login", AuthController.LoginRequest.class)
                .getAnnotation(fun.commons.framework4j.ratelimit.annotation.RateLimit.class);
        assertNotNull(annotation, "login 必须标注 @RateLimit");
        assertEquals(10, annotation.limit());
        assertEquals("1m", annotation.window());
        assertEquals("ip", annotation.scope());

        var refreshAnnotation = AuthController.class
                .getDeclaredMethod("refresh", AuthController.RefreshRequest.class)
                .getAnnotation(fun.commons.framework4j.ratelimit.annotation.RateLimit.class);
        assertNull(refreshAnnotation, "refresh 不应叠加方法级限流注解");
    }
}
