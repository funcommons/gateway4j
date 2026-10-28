package fun.commons.gateway4j.common.constant;

public enum ConditionType implements CodeEnum {

    HEADER("HEADER"),
    PATH("PATH"),
    QUERY("QUERY"),
    BODY("BODY"),
    GROOVY("GROOVY");

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
