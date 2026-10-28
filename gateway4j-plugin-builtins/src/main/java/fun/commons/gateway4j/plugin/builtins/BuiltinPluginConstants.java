package fun.commons.gateway4j.plugin.builtins;

public final class BuiltinPluginConstants {

    private BuiltinPluginConstants() {}

    public static final String SECURITY = "security";
    public static final String CACHE = "cache";
    public static final String RATE_LIMITER = "rate-limiter";
    public static final String SHARING = "sharing";
    public static final String LOGGING = "logging";
    public static final String TRACING = "tracing";
    public static final String CACHE_POST = "cache-post";
    public static final String SHARING_POST = "sharing-post";
    public static final String LOGGING_POST = "logging-post";
    public static final String TRACING_POST = "tracing-post";

    // Authentication plugins
    public static final String JWT = "jwt";
    public static final String KEY_AUTH = "key-auth";
    public static final String SIGN = "sign";
    public static final String WAF = "waf";
    public static final String BASIC_AUTH = "basic-auth";
    public static final String OAUTH2 = "oauth2";

    // Fault tolerance
    public static final String CIRCUIT_BREAKER = "circuit-breaker";
    public static final String SENTINEL = "sentinel";
    public static final String RETRY = "retry";

    // Observability
    public static final String METRICS = "metrics";
    public static final String WEBSOCKET = "websocket";

    // Traffic control
    public static final String REWRITE = "rewrite";
    public static final String REDIRECT = "redirect";
    public static final String PARAM_MAPPING = "param-mapping";
    public static final String CONTEXT_PATH = "context-path";
    public static final String REQUEST = "request";
    public static final String MODIFY_RESPONSE = "modify-response";
    public static final String MOCK = "mock";

    // Cryptor
    public static final String CRYPTOR_REQUEST = "cryptor-request";
    public static final String CRYPTOR_RESPONSE = "cryptor-response";

    // External logging
    public static final String LOGGING_KAFKA = "logging-kafka";
    public static final String LOGGING_KAFKA_POST = "logging-kafka-post";
    public static final String LOGGING_ES = "logging-es";
    public static final String LOGGING_ES_POST = "logging-es-post";

    // Enterprise SSO
    public static final String DINGTALK = "dingtalk";

    // Response injection
    public static final String WATERMARK = "watermark";
}
