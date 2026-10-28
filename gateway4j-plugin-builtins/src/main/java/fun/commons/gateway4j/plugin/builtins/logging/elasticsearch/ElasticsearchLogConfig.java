package fun.commons.gateway4j.plugin.builtins.logging.elasticsearch;

import fun.commons.gateway4j.plugin.builtins.logging.ExternalLogConfig;
import fun.commons.gateway4j.plugin.builtins.logging.LoggingPluginConfig;

import java.util.List;

public class ElasticsearchLogConfig extends ExternalLogConfig {

    private String host;
    private Integer port;
    private String username;
    private String password;
    private String indexName;
    private List<LoggingPluginConfig.DesensitizeRule> desensitizeRules;

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getIndexName() {
        return indexName;
    }

    public void setIndexName(String indexName) {
        this.indexName = indexName;
    }

    public List<LoggingPluginConfig.DesensitizeRule> getDesensitizeRules() {
        return desensitizeRules;
    }

    public void setDesensitizeRules(List<LoggingPluginConfig.DesensitizeRule> desensitizeRules) {
        this.desensitizeRules = desensitizeRules;
    }
}
