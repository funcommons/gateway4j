package fun.commons.gateway4j.plugin.api;

public final class PluginResult {

    private final Type type;
    private final String errorMessage;

    private PluginResult(Type type, String errorMessage) {
        this.type = type;
        this.errorMessage = errorMessage;
    }

    public static PluginResult success() {
        return new PluginResult(Type.SUCCESS, null);
    }

    public static PluginResult failed(String errorMessage) {
        return new PluginResult(Type.FAILED, errorMessage);
    }

    public static PluginResult skip() {
        return new PluginResult(Type.SKIP, null);
    }

    public Type type() {
        return type;
    }

    public String errorMessage() {
        return errorMessage;
    }

    public boolean isSuccess() {
        return type == Type.SUCCESS;
    }

    public boolean isFailed() {
        return type == Type.FAILED;
    }

    public boolean isSkip() {
        return type == Type.SKIP;
    }

    public enum Type {
        SUCCESS, FAILED, SKIP
    }
}
