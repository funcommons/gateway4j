package fun.commons.gateway4j.common.constant;

public enum PluginScope implements CodeEnum {

    GLOBAL("GLOBAL"),
    ROUTE("ROUTE");

    private final String code;

    PluginScope(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static PluginScope fromCode(String code) {
        for (PluginScope value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown PluginScope code: " + code);
    }
}
