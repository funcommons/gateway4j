package fun.commons.gateway4j.plugin.builtins.logging;

import java.util.List;
import java.util.Map;

public class LoggingPluginConfig {

    private boolean logRequestBody = false;
    private boolean logResponseBody = false;
    private int maxBodySize = 4096;
    private List<DesensitizeRule> desensitizeRules;

    public boolean isLogRequestBody() { return logRequestBody; }
    public void setLogRequestBody(boolean logRequestBody) { this.logRequestBody = logRequestBody; }
    public boolean isLogResponseBody() { return logResponseBody; }
    public void setLogResponseBody(boolean logResponseBody) { this.logResponseBody = logResponseBody; }
    public int getMaxBodySize() { return maxBodySize; }
    public void setMaxBodySize(int maxBodySize) { this.maxBodySize = maxBodySize; }
    public List<DesensitizeRule> getDesensitizeRules() { return desensitizeRules; }
    public void setDesensitizeRules(List<DesensitizeRule> desensitizeRules) { this.desensitizeRules = desensitizeRules; }

    public static class DesensitizeRule {
        private String field;
        private String strategy;

        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
        public String getStrategy() { return strategy; }
        public void setStrategy(String strategy) { this.strategy = strategy; }
    }
}
