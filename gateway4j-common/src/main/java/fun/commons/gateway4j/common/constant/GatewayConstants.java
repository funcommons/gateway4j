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

    /**
     * 响应装饰晚绑定桥的装饰工厂 attr 键（S11-4e），值类型为
     * {@code java.util.function.Function<ServerHttpResponse, ServerHttpResponse>}。
     *
     * <p><b>用法契约（响应装饰类 PRE 插件）</b>：插件 execute 时把装饰工厂置入
     * （原始）exchange attributes——attribute map 原始/mutated exchange 共享
     * （{@code DefaultServerWebExchange.Builder} 持有原 exchange attributes map
     * 引用，mutate 不拷贝）——然后 <b>透传 exchange，勿再 mutate().response()</b>。
     * 写回时由 order=-2 的桥（engine 的 PluginResponseDecorationBridgeFilter）持有
     * 的晚绑定装饰器读取该工厂并应用。</p>
     *
     * <p><b>为什么必须晚绑定</b>：插件链 PluginExecutionFilter（order 10020）晚于
     * SCG NettyWriteResponseFilter（order -1）被调，而 SCG 写回闭包
     * {@code chain.filter(exchange).then(Mono.defer(...))} 在 <b>插件链运行前</b>
     * 就已捕获装配时的 exchange——PRE 插件 mutate().response() 只向下游传播
     * （NettyRoutingFilter 收到 mutated 做上游调用没问题），写回用的仍是 order=-1
     * 被调时捕获的原始 response，结构上不可达。装饰工厂必须在写回时（而非装配时）
     * 解析才能穿透 SCG 写回闭包。</p>
     *
     * <p>跨模块字面量契约（gateway4j-common ↔ engine ↔ plugin-builtins），
     * 改名即静默断链。</p>
     */
    public static final String RESPONSE_DECORATOR_FACTORY_KEY =
            PLUGIN_CONTEXT_PREFIX + "responseDecoratorFactory";
}
