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

    /**
     * 影子回放请求头（S11a 调试回放防伪造口令）。admin 侧 DebugReplayService 以该头
     * 携带共享口令（{@code gateway4j.debug.shadow-token}）向网关发调试回放请求；
     * 引擎侧 PluginExecutionFilter 读取该头并与配置口令逐字比对。防伪造语义：
     * <b>配置口令为空或头值不匹配一律按普通流量计数</b>（防公网伪造头逃逸统计），
     * 只有匹配者才视为影子请求（豁免 in-flight gauge / 插件级统计 / 路由计数）。
     * 头名与 attr 键是跨模块字面量契约（admin↔engine↔plugin-builtins），改名即
     * 静默断链。
     */
    public static final String SHADOW_HEADER = "X-Gw4j-Shadow";

    /**
     * 影子请求 exchange attr 键：引擎口令校验通过后置 {@link Boolean#TRUE}，供
     * MetricsPlugin 早退与 PluginExecutionStats 守卫读取（沿用 {@code gw4j:} 前缀，
     * 与其余 *_KEY 命名一致）。
     */
    public static final String SHADOW_KEY = PLUGIN_CONTEXT_PREFIX + "shadow";
}
