package fun.commons.gateway4j.plugin.builtins.metrics;

public class MetricsPluginConfig {

    private boolean enabled = true;
    private String metricsPrefix = "gateway4j";
    private boolean logRequestCount = true;
    private boolean logLatency = true;
    private boolean logErrorCount = true;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getMetricsPrefix() { return metricsPrefix; }
    public void setMetricsPrefix(String metricsPrefix) { this.metricsPrefix = metricsPrefix; }
    public boolean isLogRequestCount() { return logRequestCount; }
    public void setLogRequestCount(boolean logRequestCount) { this.logRequestCount = logRequestCount; }
    public boolean isLogLatency() { return logLatency; }
    public void setLogLatency(boolean logLatency) { this.logLatency = logLatency; }
    public boolean isLogErrorCount() { return logErrorCount; }
    public void setLogErrorCount(boolean logErrorCount) { this.logErrorCount = logErrorCount; }
}
