package fun.commons.gateway4j.common.constant;

public enum RouteStatus implements CodeEnum {

    DRAFT("DRAFT"),
    PUBLISHED("PUBLISHED"),
    OFFLINE("OFFLINE"),
    CHANGING("CHANGING");

    private final String code;

    RouteStatus(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static RouteStatus fromCode(String code) {
        for (RouteStatus value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown RouteStatus code: " + code);
    }
}
