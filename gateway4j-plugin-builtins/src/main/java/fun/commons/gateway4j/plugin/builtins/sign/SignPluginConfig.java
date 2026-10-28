package fun.commons.gateway4j.plugin.builtins.sign;

public class SignPluginConfig {

    private String appKey;
    private String appSecret;
    private Long delayMinutes;
    private Boolean signRequestBody;
    private String algorithm;
    private String appKeyHeader;
    private String timestampHeader;
    private String signHeader;

    public String getAppKey() {
        return appKey;
    }

    public void setAppKey(String appKey) {
        this.appKey = appKey;
    }

    public String getAppSecret() {
        return appSecret;
    }

    public void setAppSecret(String appSecret) {
        this.appSecret = appSecret;
    }

    public Long getDelayMinutes() {
        return delayMinutes;
    }

    public void setDelayMinutes(Long delayMinutes) {
        this.delayMinutes = delayMinutes;
    }

    public Boolean getSignRequestBody() {
        return signRequestBody;
    }

    public void setSignRequestBody(Boolean signRequestBody) {
        this.signRequestBody = signRequestBody;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public void setAlgorithm(String algorithm) {
        this.algorithm = algorithm;
    }

    public String getAppKeyHeader() {
        return appKeyHeader;
    }

    public void setAppKeyHeader(String appKeyHeader) {
        this.appKeyHeader = appKeyHeader;
    }

    public String getTimestampHeader() {
        return timestampHeader;
    }

    public void setTimestampHeader(String timestampHeader) {
        this.timestampHeader = timestampHeader;
    }

    public String getSignHeader() {
        return signHeader;
    }

    public void setSignHeader(String signHeader) {
        this.signHeader = signHeader;
    }
}
