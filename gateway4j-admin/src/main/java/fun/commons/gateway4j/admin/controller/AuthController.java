package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.core.AccessTokenGenerator.TokenPair;
import fun.commons.framework4j.accesstoken.core.RefreshTokenService;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.framework4j.ratelimit.annotation.RateLimit;
import fun.commons.gateway4j.admin.service.AuthService;
import fun.commons.gateway4j.admin.service.WeakPasswordDetector;
import fun.commons.gateway4j.common.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final RefreshTokenService refreshTokenService;
    private final WeakPasswordDetector weakPasswordDetector;

    public AuthController(AuthService authService,
                          @Autowired(required = false) RefreshTokenService refreshTokenService,
                          @Autowired(required = false) WeakPasswordDetector weakPasswordDetector) {
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
        this.weakPasswordDetector = weakPasswordDetector;
    }

    /**
     * 登录接口自我保护限流：IP 维度 10 次/分钟（滑动窗口），防口令爆破。
     * 超限返回 HTTP 429 + 信封 10500（TOO_MANY_REQUESTS）+ Retry-After。
     *
     * <p>P2-9：响应平铺追加 {@code password_stale}（Boolean）——当前登录用户口令
     * 是否仍为出厂弱口令 admin123（非阻断提示，仅供前端展示改密横幅；不拦截任何
     * 流程。阻断式改密会破坏既有 e2e 回归并把自动化部署的管理入口锁死，故不做）。
     * 改密端点：POST /v1/users/{id}/reset-password 或 PATCH /v1/users/{id}（带 password）。</p>
     */
    @PostMapping("/login")
    @RateLimit(limit = 10, window = "1m", scope = "ip")
    public Map<String, Object> login(@RequestBody LoginRequest request) {
        User user = authService.authenticate(request.username(), request.password());
        List<String> roles = authService.getUserRoleCodes(user.getId());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user_id", String.valueOf(user.getId()));
        result.put("username", user.getUsername());
        result.put("real_name", user.getRealName() != null ? user.getRealName() : "");
        result.put("roles", roles);

        if (refreshTokenService != null) {
            TokenPair pair = refreshTokenService.generateTokenPair(Map.of(
                    "type", "BEARER",
                    "user_id", user.getId(),
                    "username", user.getUsername(),
                    "roles", roles
            ));
            result.put("access_token", pair.accessToken());
            result.put("refresh_token", pair.refreshToken());
            result.put("expires_in", pair.accessExpiresInSeconds());
        }
        // P2-9：弱口令提示位（detector 未装配时恒 false，绝不影响登录主流程）
        result.put("password_stale",
                weakPasswordDetector != null && weakPasswordDetector.isPasswordStale(user));
        return result;
    }

    @PostMapping("/refresh")
    public Map<String, Object> refresh(@RequestBody RefreshRequest request) {
        if (refreshTokenService == null) {
            throw new IllegalStateException("Token service unavailable");
        }
        TokenPair pair = refreshTokenService.refreshAccessToken(request.refreshToken());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("access_token", pair.accessToken());
        result.put("refresh_token", pair.refreshToken());
        result.put("expires_in", pair.accessExpiresInSeconds());
        return result;
    }

    public record LoginRequest(String username, String password) {}

    public record RefreshRequest(String refreshToken) {}
}
