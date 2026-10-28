package fun.commons.gateway4j.plugin.builtins.ratelimit;

public class RateLimitPluginConfig {

    private int limit;
    private String window;
    private String dimension;
    private Long periodMs;
    private String mode; // "LOCAL" or "DISTRIBUTED"

    public int getLimit() {
        return limit;
    }

    public void setLimit(int limit) {
        this.limit = limit;
    }

    public String getWindow() {
        return window;
    }

    public void setWindow(String window) {
        this.window = window;
    }

    public String getDimension() {
        return dimension;
    }

    public void setDimension(String dimension) {
        this.dimension = dimension;
    }

    public Long getPeriodMs() {
        return periodMs;
    }

    public void setPeriodMs(Long periodMs) {
        this.periodMs = periodMs;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }
}
