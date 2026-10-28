package fun.commons.gateway4j.common.constant;

public enum ConditionOperator implements CodeEnum {

    EQ("EQ"),
    NE("NE"),
    CONTAINS("CONTAINS"),
    REGEX("REGEX"),
    EXISTS("EXISTS"),
    GT("GT"),
    LT("LT");

    private final String code;

    ConditionOperator(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static ConditionOperator fromCode(String code) {
        for (ConditionOperator value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown ConditionOperator code: " + code);
    }
}
