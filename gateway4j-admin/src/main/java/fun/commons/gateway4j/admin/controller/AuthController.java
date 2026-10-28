package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.core.AccessTokenGenerator.TokenPair;
import fun.commons.framework4j.accesstoken.core.RefreshTokenService;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.accesstoken.context.TokenContext;
import fun.commons.gateway4j.admin.service.AuthService;
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

    public AuthController(AuthService authService,
                          @Autowired(required = false) RefreshTokenService refreshTokenService) {
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/login")
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
