package fun.commons.gateway4j.common.constant;

public enum PluginPhase implements CodeEnum {

    PRE("PRE"),
    POST("POST");

    private final String code;

    PluginPhase(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }

    public static PluginPhase fromCode(String code) {
        for (PluginPhase value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Unknown PluginPhase code: " + code);
    }
}
