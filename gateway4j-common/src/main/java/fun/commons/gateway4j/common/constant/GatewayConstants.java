package fun.commons.gateway4j.common.constant;

public final class GatewayConstants {

    private GatewayConstants() {}

    public static final int MAX_DISPATCH_DEPTH = 5;
    public static final String PLUGIN_CONTEXT_PREFIX = "gw4j:";
    public static final String TRACE_ID_KEY = PLUGIN_CONTEXT_PREFIX + "traceId";
    public static final String ROUTE_ID_KEY = PLUGIN_CONTEXT_PREFIX + "routeId";
    public static final String RESOLVED_ROUTE_KEY = PLUGIN_CONTEXT_PREFIX + "resolvedRoute";
    public static final String CONFIG_VERSION_KEY = PLUGIN_CONTEXT_PREFIX + "configVersion";
    public static final String REQUEST_START_TIME_KEY = PLUGIN_CONTEXT_PREFIX + "requestStartTime";
    public static final String CACHED_REQUEST_BODY_KEY = PLUGIN_CONTEXT_PREFIX + "cachedRequestBody";
}
