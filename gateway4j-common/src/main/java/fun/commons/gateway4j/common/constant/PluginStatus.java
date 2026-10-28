package fun.commons.gateway4j.common.constant;

public enum PluginStatus implements CodeEnum {

    ENABLED("ENABLED"),
    DISABLED("DISABLED");

    private final String code;

    PluginStatus(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static PluginStatus fromCode(String code) {
        for (PluginStatus value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown PluginStatus code: " + code);
    }
}
