package fun.commons.gateway4j.common.constant;

public enum PluginType implements CodeEnum {

    BUILTIN("BUILTIN"),
    JAR("JAR"),
    GROOVY("GROOVY"),
    GROUP("GROUP");

    private final String code;

    PluginType(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static PluginType fromCode(String code) {
        for (PluginType value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown PluginType code: " + code);
    }
}
