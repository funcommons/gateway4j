package fun.commons.gateway4j.plugin.builtins.jwt;

import fun.commons.gateway4j.common.util.JsonUtils;
import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.Claim;
import com.auth0.jwt.interfaces.DecodedJWT;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class JwtPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(JwtPlugin.class);
    private static final String DEFAULT_TOKEN_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private volatile JwtPluginConfig config;

    public JwtPlugin() {
        super(BuiltinPluginConstants.JWT, "JWT认证插件", "PRE", 2);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null) {
            return chain.execute(exchange);
        }

        String algo = config.getAlgorithm() != null ? config.getAlgorithm().toUpperCase() : "HS256";
        boolean isHmac = algo.startsWith("HS");
        boolean isAsymmetric = algo.startsWith("RS") || algo.startsWith("ES");
        if (isHmac && (config.getSecretKey() == null || config.getSecretKey().isEmpty())) {
            log.warn("JWT secretKey is not configured, rejecting request");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
        if (isAsymmetric && (config.getPublicKey() == null || config.getPublicKey().isEmpty())) {
            log.warn("JWT publicKey is not configured for algorithm {}, rejecting request", algo);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String token = resolveToken(exchange);
        if (token == null || token.isEmpty()) {
            log.warn("JWT token not found in request");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        Map<String, Object> claims = verifyAndParse(token);
        if (claims == null) {
            log.warn("JWT token verification failed");
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        if (config.getConverter() != null && !config.getConverter().isEmpty()) {
            ServerWebExchange mutated = applyClaimToHeaders(exchange, claims);
            return chain.execute(mutated);
        }

        return chain.execute(exchange);
    }

    @Override
    public void onConfigChange(PluginConfig config) {
        this.config = JsonUtils.parseObject(config.config(), JwtPluginConfig.class);
    }

    private String resolveToken(ServerWebExchange exchange) {
        String headerName = config.getTokenHeader() != null ? config.getTokenHeader() : DEFAULT_TOKEN_HEADER;

        String value = exchange.getRequest().getHeaders().getFirst(headerName);
        if (value == null && DEFAULT_TOKEN_HEADER.equals(headerName)) {
            value = exchange.getRequest().getHeaders().getFirst("token");
        }

        if (value == null) {
            return null;
        }

        if (value.startsWith(BEARER_PREFIX)) {
            return value.substring(BEARER_PREFIX.length()).trim();
        }
        return value.trim();
    }

    private Map<String, Object> verifyAndParse(String token) {
        try {
            Algorithm algorithm = resolveAlgorithm();
            if (algorithm == null) {
                log.warn("JWT algorithm could not be resolved from config");
                return null;
            }
            JWTVerifier verifier = JWT.require(algorithm).build();
            verifier.verify(token);
            DecodedJWT jwt = JWT.decode(token);
            Map<String, Object> result = new HashMap<>();
            jwt.getClaims().forEach((key, claim) -> {
                if (claim.isNull()) return;
                Object value = extractClaimValue(claim);
                if (value != null) {
                    result.put(key, value);
                }
            });
            return result;
        } catch (JWTVerificationException e) {
            log.debug("JWT verification failed: {}", e.getMessage());
            return null;
        }
    }

    private Algorithm resolveAlgorithm() {
        String algo = config.getAlgorithm() != null ? config.getAlgorithm().toUpperCase() : "HS256";
        try {
            return switch (algo) {
                case "HS256" -> {
                    if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) yield null;
                    yield Algorithm.HMAC256(config.getSecretKey());
                }
                case "HS384" -> {
                    if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) yield null;
                    yield Algorithm.HMAC384(config.getSecretKey());
                }
                case "HS512" -> {
                    if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) yield null;
                    yield Algorithm.HMAC512(config.getSecretKey());
                }
                case "RS256" -> Algorithm.RSA256(resolveRsaPublicKey(), resolveRsaPrivateKey());
                case "RS384" -> Algorithm.RSA384(resolveRsaPublicKey(), resolveRsaPrivateKey());
                case "RS512" -> Algorithm.RSA512(resolveRsaPublicKey(), resolveRsaPrivateKey());
                case "ES256" -> Algorithm.ECDSA256(resolveEcPublicKey(), resolveEcPrivateKey());
                case "ES384" -> Algorithm.ECDSA384(resolveEcPublicKey(), resolveEcPrivateKey());
                case "ES512" -> Algorithm.ECDSA512(resolveEcPublicKey(), resolveEcPrivateKey());
                default -> {
                    log.warn("Unsupported JWT algorithm: {}, falling back to HS256", algo);
                    if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) yield null;
                    yield Algorithm.HMAC256(config.getSecretKey());
                }
            };
        } catch (Exception e) {
            log.warn("Failed to create JWT algorithm: {}", e.getMessage());
            return null;
        }
    }

    private RSAPublicKey resolveRsaPublicKey() throws Exception {
        if (config.getPublicKey() == null || config.getPublicKey().isEmpty()) {
            throw new IllegalStateException("RSA public key not configured");
        }
        byte[] keyBytes = java.util.Base64.getDecoder().decode(config.getPublicKey());
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
    }

    private RSAPrivateKey resolveRsaPrivateKey() throws Exception {
        if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) {
            return null;
        }
        byte[] keyBytes = java.util.Base64.getDecoder().decode(config.getSecretKey());
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(spec);
    }

    private ECPublicKey resolveEcPublicKey() throws Exception {
        if (config.getPublicKey() == null || config.getPublicKey().isEmpty()) {
            throw new IllegalStateException("EC public key not configured");
        }
        byte[] keyBytes = java.util.Base64.getDecoder().decode(config.getPublicKey());
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(spec);
    }

    private ECPrivateKey resolveEcPrivateKey() throws Exception {
        if (config.getSecretKey() == null || config.getSecretKey().isEmpty()) {
            return null;
        }
        byte[] keyBytes = java.util.Base64.getDecoder().decode(config.getSecretKey());
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(spec);
    }

    private Object extractClaimValue(Claim claim) {
        try { return claim.asString(); } catch (Exception ignored) {}
        try { return claim.asInt(); } catch (Exception ignored) {}
        try { return claim.asLong(); } catch (Exception ignored) {}
        try { return claim.asDouble(); } catch (Exception ignored) {}
        try { return claim.asBoolean(); } catch (Exception ignored) {}
        try { return claim.asList(String.class); } catch (Exception ignored) {}
        try { return claim.asMap(); } catch (Exception ignored) {}
        return claim.toString();
    }

    @SuppressWarnings("unchecked")
    private ServerWebExchange applyClaimToHeaders(ServerWebExchange exchange, Map<String, Object> claims) {
        var requestBuilder = exchange.getRequest().mutate();
        for (JwtClaimConverter converter : config.getConverter()) {
            Object value = resolveNestedClaim(claims, converter.getJwtVal());
            if (value != null) {
                requestBuilder.header(converter.getHeaderVal(), String.valueOf(value));
            }
        }
        return exchange.mutate().request(requestBuilder.build()).build();
    }

    private Object resolveNestedClaim(Map<String, Object> claims, String path) {
        if (path == null || path.isEmpty()) return null;
        String[] parts = path.split("\\.");
        Object current = claims;
        for (String part : parts) {
            if (current instanceof Map<?, ?> map) {
                current = map.get(part);
            } else {
                return null;
            }
        }
        return current;
    }
}
