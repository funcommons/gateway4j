package fun.commons.gateway4j.plugin.builtins.oauth2;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

public class OAuth2Plugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(OAuth2Plugin.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private volatile OAuth2PluginConfig config;
    private volatile WebClient webClient;

    public OAuth2Plugin() {
        super(BuiltinPluginConstants.OAUTH2, "OAuth2认证插件", "PRE", 2);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String token = resolveToken(exchange);
        if (token == null || token.isEmpty()) {
            return redirectToAuthServer(exchange);
        }

        if (config.getTokenUri() != null && !config.getTokenUri().isEmpty()) {
            return validateToken(exchange, chain, token);
        }

        if (config.getUserInfoUri() != null && !config.getUserInfoUri().isEmpty()) {
            return fetchUserInfo(exchange, chain, token);
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), OAuth2PluginConfig.class);
        if (this.config != null) {
            this.webClient = WebClient.builder().build();
        }
    }

    private String resolveToken(ServerWebExchange exchange) {
        if (config.getTokenHeader() != null) {
            String value = exchange.getRequest().getHeaders().getFirst(config.getTokenHeader());
            if (value != null) {
                if (value.startsWith(BEARER_PREFIX)) {
                    return value.substring(BEARER_PREFIX.length()).trim();
                }
                return value.trim();
            }
        }

        if (config.getTokenQuery() != null) {
            String value = exchange.getRequest().getQueryParams().getFirst(config.getTokenQuery());
            if (value != null) return value.trim();
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length()).trim();
        }

        return null;
    }

    private Mono<Void> validateToken(ServerWebExchange exchange, PluginChain chain, String token) {
        return introspectToken(token)
                .flatMap(response -> {
                    if (response == null) {
                        log.debug("OAuth2 token introspection returned null");
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }

                    Boolean active = (Boolean) response.get("active");
                    if (active == null || !active) {
                        log.debug("OAuth2 token is not active");
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }

                    injectUserHeaders(exchange, response);
                    return chain.execute(exchange);
                })
                .onErrorResume(Exception.class, e -> {
                    log.warn("OAuth2 token validation failed: {}", e.getMessage());
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                });
    }

    private Mono<Void> fetchUserInfo(ServerWebExchange exchange, PluginChain chain, String token) {
        return webClient.get()
                .uri(config.getUserInfoUri())
                .header(HttpHeaders.AUTHORIZATION, BEARER_PREFIX + token)
                .retrieve()
                .bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
                .flatMap(userInfo -> {
                    if (userInfo == null) {
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }
                    injectUserHeaders(exchange, userInfo);
                    return chain.execute(exchange);
                })
                .onErrorResume(Exception.class, e -> {
                    log.warn("OAuth2 user info fetch failed: {}", e.getMessage());
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                });
    }

    @SuppressWarnings("unchecked")
    private Mono<Map<String, Object>> introspectToken(String token) {
        String clientId = config.getClientId();
        String clientSecret = config.getClientSecret();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        if (clientId != null && clientSecret != null) {
            String credentials = Base64.getEncoder().encodeToString(
                    (clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));
            headers.set(HttpHeaders.AUTHORIZATION, "Basic " + credentials);
        }

        String body = "token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);

        return webClient.post()
                .uri(config.getTokenUri())
                .headers(h -> h.addAll(headers))
                .bodyValue(body)
                .retrieve()
                .bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {});
    }

    @SuppressWarnings("unchecked")
    private void injectUserHeaders(ServerWebExchange exchange, Map<String, Object> userInfo) {
        var requestBuilder = exchange.getRequest().mutate();
        Object sub = userInfo.get("sub");
        if (sub != null) requestBuilder.header("X-User", String.valueOf(sub));
        Object username = userInfo.get("username");
        if (username == null) username = userInfo.get("preferred_username");
        if (username != null) requestBuilder.header("X-Username", String.valueOf(username));
        Object scope = userInfo.get("scope");
        if (scope != null) requestBuilder.header("X-OAuth2-Scope", String.valueOf(scope));
    }

    private Mono<Void> redirectToAuthServer(ServerWebExchange exchange) {
        if (config.getAuthorizationUri() == null) {
            log.warn("OAuth2 authorization URI not configured, rejecting request");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String callbackUrl = config.getRedirectUri();
        if (callbackUrl == null || callbackUrl.isEmpty()) {
            String scheme = exchange.getRequest().getURI().getScheme();
            String host = exchange.getRequest().getURI().getHost();
            int port = exchange.getRequest().getURI().getPort();
            callbackUrl = scheme + "://" + host + (port > 0 && port != 80 && port != 443 ? ":" + port : "") + "/oauth2/callback";
        }

        String state = java.util.UUID.randomUUID().toString();
        String redirectUri = config.getAuthorizationUri()
                + "?response_type=code"
                + "&client_id=" + URLEncoder.encode(config.getClientId() != null ? config.getClientId() : "", StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(callbackUrl, StandardCharsets.UTF_8)
                + "&state=" + state;

        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(URI.create(redirectUri));
        return exchange.getResponse().setComplete();
    }
}
