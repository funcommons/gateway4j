package fun.commons.gateway4j.plugin.builtins.retry;

public class RetryPluginConfig {

    private int retryCount = 3;
    private String strategy = "FIXED";
    private Long waitDurationMs = 100L;
    private Double multiplier;
    private Long maxWaitDurationMs;
    private String failoverUpstream;
    private java.util.List<Integer> retryStatusCodes;

    public int getRetryCount() { return retryCount; }
    public void setRetryCount(int retryCount) { this.retryCount = retryCount; }
    public String getStrategy() { return strategy; }
    public void setStrategy(String strategy) { this.strategy = strategy; }
    public Long getWaitDurationMs() { return waitDurationMs; }
    public void setWaitDurationMs(Long waitDurationMs) { this.waitDurationMs = waitDurationMs; }
    public Double getMultiplier() { return multiplier; }
    public void setMultiplier(Double multiplier) { this.multiplier = multiplier; }
    public Long getMaxWaitDurationMs() { return maxWaitDurationMs; }
    public void setMaxWaitDurationMs(Long maxWaitDurationMs) { this.maxWaitDurationMs = maxWaitDurationMs; }
    public String getFailoverUpstream() { return failoverUpstream; }
    public void setFailoverUpstream(String failoverUpstream) { this.failoverUpstream = failoverUpstream; }
    public java.util.List<Integer> getRetryStatusCodes() { return retryStatusCodes; }
    public void setRetryStatusCodes(java.util.List<Integer> retryStatusCodes) { this.retryStatusCodes = retryStatusCodes; }
}
