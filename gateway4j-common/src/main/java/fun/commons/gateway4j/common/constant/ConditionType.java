package fun.commons.gateway4j.common.constant;

public enum ConditionType implements CodeEnum {

    HEADER("HEADER"),
    PATH("PATH"),
    QUERY("QUERY"),
    BODY("BODY"),
    GROOVY("GROOVY"),
    /**
     * 流量分割声明（MSE 金丝雀 / APISIX traffic-split 口径）：不是请求谓词，
     * 不参与 {@code match}；{@code condition_key} 存正整数字符串权重
     * （如 {@code "20"}/{@code "80"}），{@code condition_value} 可空忽略。
     * 由 RouteDispatcher 在同一分发路由下无任何非 WEIGHT 条件匹配时，
     * 按权重比例随机选择候选子路由。
     */
    WEIGHT("WEIGHT"),
    /**
     * 主机名条件（SCG {@code HostPredicateFactory} 口径）：condition_value 为
     * HostPredicate pattern（{@code **} 至少一段任意子域 / {@code *} 恰好单段子域）
     * 或精确域名；condition_key 忽略。匹配目标为 Host 头（大小写不敏感，
     * 头缺失返回 false，禁止回落 RemoteAddress）；value 含通配符时独立于
     * operator 按 SCG pattern 语义翻译为正则（预编译缓存），无通配符时按
     * operator 语义（EQ=精确域名）走 matchOperator。
     */
    HOST("HOST"),
    /**
     * HTTP 方法条件（SCG {@code MethodPredicateFactory} 口径）：condition_value
     * 为 HTTP 方法名，EQ/NE 比较大小写不敏感（{@code post} 等价 {@code POST}）；
     * condition_key 忽略。
     */
    METHOD("METHOD"),
    /**
     * Cookie 条件（SCG {@code CookiePredicateFactory} 口径）：condition_key 为
     * cookie 名，取首个同名 cookie 的 value 走 matchOperator；cookie 缺失时
     * 语义同 HEADER（EXISTS=false / NE=true）。
     */
    COOKIE("COOKIE"),
    /**
     * 客户端地址条件（SCG remote-address 谓词 + Netty {@code IpSubnetFilterRule}
     * 口径）：condition_value 为 CIDR 网段（如 {@code 1.2.3.0/24} /
     * {@code 2001:db8::/32}），无斜杠纯 IP 视为 /32 单值；匹配目标为
     * getRemoteAddress()（InetAddress byte[] 前缀比较，不引新依赖），
     * operator 不参与 CIDR 语义。
     */
    REMOTE_ADDR("REMOTE_ADDR"),
    /**
     * 时间窗条件（SCG {@code AfterRoutePredicateFactory} 口径）：condition_value
     * 为 ISO-8601 日期时间（OffsetDateTime/Instant 均可解析），请求时间
     * （Instant.now()）严格晚于该值即命中；operator 不参与时间比较语义，
     * 解析失败返回 false。
     */
    AFTER("AFTER"),
    /**
     * 时间窗条件（SCG {@code BeforeRoutePredicateFactory} 口径）：condition_value
     * 为 ISO-8601 日期时间，请求时间（Instant.now()）严格早于该值即命中；
     * operator 不参与时间比较语义，解析失败返回 false。
     */
    BEFORE("BEFORE"),
    /**
     * 时间窗条件（闭开区间 [start, end)，SCG After+Before 组合口径）：
     * condition_value 为 {@code start,end} 逗号分隔的两个 ISO-8601 值，
     * start 含端（now 不早于 start 即命中）、end 含端不命中；condition_key
     * 忽略，operator 不参与，解析失败/畸形（单值/多于两段）返回 false。
     */
    BETWEEN("BETWEEN");

    private final String code;

    ConditionType(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static ConditionType fromCode(String code) {
        for (ConditionType value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown ConditionType code: " + code);
    }
}
