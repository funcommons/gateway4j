package fun.commons.gateway4j.common.constant;

public enum RouteType implements CodeEnum {

    DISPATCH("DISPATCH"),
    BACKEND("BACKEND");

    private final String code;

    RouteType(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static RouteType fromCode(String code) {
        for (RouteType value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown RouteType code: " + code);
    }
}
