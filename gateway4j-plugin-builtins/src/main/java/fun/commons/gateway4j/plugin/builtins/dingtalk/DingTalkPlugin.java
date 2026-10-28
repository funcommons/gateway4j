package fun.commons.gateway4j.plugin.builtins.dingtalk;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 钉钉 SSO 认证插件。无有效 token 时 302 跳转钉钉 OAuth 登录页；
 * 回调时通过钉钉 open API 换取用户信息并注入 X-User 头。
 */
public class DingTalkPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(DingTalkPlugin.class);
    private static final String DINGTALK_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
    private static final String DINGTALK_USER_URL = "https://api.dingtalk.com/v1.0/contact/users/me";
    private static final String OAUTH_AUTHORIZE_URL = "https://login.dingtalk.com/oauth2/auth";

    private volatile DingTalkPluginConfig config;
    private volatile WebClient webClient;

    public DingTalkPlugin() {
        super(BuiltinPluginConstants.DINGTALK, "钉钉认证插件", "PRE", 2);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || !config.isEnabled()) {
            return chain.execute(exchange);
        }
        if (isExcluded(exchange)) {
            return chain.execute(exchange);
        }

        String path = exchange.getRequest().getPath().value();
        String authCode = exchange.getRequest().getQueryParams().getFirst("authCode");
        if (authCode != null && !authCode.isEmpty()) {
            return handleCallback(exchange, chain, authCode);
        }

        String token = resolveToken(exchange);
        if (token == null || token.isEmpty()) {
            return redirectToLogin(exchange);
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), DingTalkPluginConfig.class);
        if (this.config != null && this.config.getAppKey() != null) {
            this.webClient = WebClient.builder().build();
        }
    }

    private boolean isExcluded(ServerWebExchange exchange) {
        String method = exchange.getRequest().getMethod().name();
        if ("OPTIONS".equals(method)) {
            return true;
        }
        String path = exchange.getRequest().getPath().value();
        if (config.getExcludePaths() != null) {
            for (String p : config.getExcludePaths()) {
                if (path.startsWith(p)) return true;
            }
        }
        if (config.getExcludeFileExt() != null) {
            for (String ext : config.getExcludeFileExt()) {
                if (path.endsWith(ext)) return true;
            }
        }
        return false;
    }

    private String resolveToken(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(config.getCookieName());
        return cookie != null ? cookie.getValue() : null;
    }

    private Mono<Void> redirectToLogin(ServerWebExchange exchange) {
        String loginServer = config.getLoginServer() != null ? config.getLoginServer() : "";
        String currentUrl = loginServer + exchange.getRequest().getPath().value();
        String redirectUri = URLEncoder.encode(currentUrl, StandardCharsets.UTF_8);
        String state = URLEncoder.encode(exchange.getRequest().getPath().value(), StandardCharsets.UTF_8);
        String loginUrl = OAUTH_AUTHORIZE_URL
                + "?redirect_uri=" + redirectUri
                + "&response_type=code"
                + "&client_id=" + config.getAppKey()
                + "&scope=openid"
                + "&state=" + state
                + "&prompt=consent";

        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(URI.create(loginUrl));
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> handleCallback(ServerWebExchange exchange, PluginChain chain, String authCode) {
        if (webClient == null) {
            log.warn("DingTalk webClient not initialized");
            return redirectToLogin(exchange);
        }
        Map<String, String> tokenRequest = Map.of(
                "clientId", config.getAppKey(),
                "clientSecret", config.getAppSecret(),
                "code", authCode,
                "grantType", "authorization_code"
        );

        return webClient.post()
                .uri(DINGTALK_TOKEN_URL)
                .bodyValue(tokenRequest)
                .retrieve()
                .bodyToMono(Map.class)
                .flatMap(tokenResp -> {
                    String accessToken = (String) tokenResp.get("accessToken");
                    if (accessToken == null) {
                        log.warn("DingTalk token exchange failed: {}", tokenResp);
                        return redirectToLogin(exchange);
                    }
                    return webClient.get()
                            .uri(DINGTALK_USER_URL)
                            .header("x-acs-dingtalk-access-token", accessToken)
                            .retrieve()
                            .bodyToMono(Map.class)
                            .flatMap(userInfo -> {
                                String nick = (String) userInfo.get("nick");
                                String unionId = (String) userInfo.get("unionId");
                                var builder = exchange.getRequest().mutate();
                                if (nick != null) builder.header("X-User-Nick", nick);
                                if (unionId != null) builder.header("X-User", unionId);
                                exchange.getResponse().addCookie(
                                        org.springframework.http.ResponseCookie.from(config.getCookieName(), accessToken)
                                                .path("/").httpOnly(true).build());
                                return chain.execute(exchange.mutate().request(builder.build()).build());
                            });
                })
                .onErrorResume(e -> {
                    log.warn("DingTalk auth error: {}", e.getMessage());
                    return redirectToLogin(exchange);
                });
    }
}
