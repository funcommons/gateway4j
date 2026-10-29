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
    WEIGHT("WEIGHT");

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
