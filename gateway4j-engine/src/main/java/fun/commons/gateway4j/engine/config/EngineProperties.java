package fun.commons.gateway4j.engine.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("gateway4j.engine")
public class EngineProperties {

    private int maxDepth = 5;
    private int defaultTimeout = 30;

    public int getMaxDepth() {
        return maxDepth;
    }

    public void setMaxDepth(int maxDepth) {
        this.maxDepth = maxDepth;
    }

    public int getDefaultTimeout() {
        return defaultTimeout;
    }

    public void setDefaultTimeout(int defaultTimeout) {
        this.defaultTimeout = defaultTimeout;
    }
}
