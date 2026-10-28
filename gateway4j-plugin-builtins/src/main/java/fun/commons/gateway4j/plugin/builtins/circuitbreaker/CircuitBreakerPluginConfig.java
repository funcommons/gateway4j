package fun.commons.gateway4j.plugin.builtins.circuitbreaker;

public class CircuitBreakerPluginConfig {

    private Boolean circuitEnable;
    private Float failureRateThreshold;
    private Long waitDurationMs;
    private Integer permittedCallsInHalfOpen;
    private Integer slidingWindowSize;
    private Integer minimumNumberOfCalls;
    private Long timeoutDurationMs;
    private Integer limitForPeriod;
    private Long limitRefreshPeriodMs;
    private String fallbackUri;

    public Boolean getCircuitEnable() {
        return circuitEnable;
    }

    public void setCircuitEnable(Boolean circuitEnable) {
        this.circuitEnable = circuitEnable;
    }

    public Float getFailureRateThreshold() {
        return failureRateThreshold;
    }

    public void setFailureRateThreshold(Float failureRateThreshold) {
        this.failureRateThreshold = failureRateThreshold;
    }

    public Long getWaitDurationMs() {
        return waitDurationMs;
    }

    public void setWaitDurationMs(Long waitDurationMs) {
        this.waitDurationMs = waitDurationMs;
    }

    public Integer getPermittedCallsInHalfOpen() {
        return permittedCallsInHalfOpen;
    }

    public void setPermittedCallsInHalfOpen(Integer permittedCallsInHalfOpen) {
        this.permittedCallsInHalfOpen = permittedCallsInHalfOpen;
    }

    public Integer getSlidingWindowSize() {
        return slidingWindowSize;
    }

    public void setSlidingWindowSize(Integer slidingWindowSize) {
        this.slidingWindowSize = slidingWindowSize;
    }

    public Integer getMinimumNumberOfCalls() {
        return minimumNumberOfCalls;
    }

    public void setMinimumNumberOfCalls(Integer minimumNumberOfCalls) {
        this.minimumNumberOfCalls = minimumNumberOfCalls;
    }

    public Long getTimeoutDurationMs() {
        return timeoutDurationMs;
    }

    public void setTimeoutDurationMs(Long timeoutDurationMs) {
        this.timeoutDurationMs = timeoutDurationMs;
    }

    public Integer getLimitForPeriod() {
        return limitForPeriod;
    }

    public void setLimitForPeriod(Integer limitForPeriod) {
        this.limitForPeriod = limitForPeriod;
    }

    public Long getLimitRefreshPeriodMs() {
        return limitRefreshPeriodMs;
    }

    public void setLimitRefreshPeriodMs(Long limitRefreshPeriodMs) {
        this.limitRefreshPeriodMs = limitRefreshPeriodMs;
    }

    public String getFallbackUri() {
        return fallbackUri;
    }

    public void setFallbackUri(String fallbackUri) {
        this.fallbackUri = fallbackUri;
    }
}
