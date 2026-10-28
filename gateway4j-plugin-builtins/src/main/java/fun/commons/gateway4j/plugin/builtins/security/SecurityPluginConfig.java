package fun.commons.gateway4j.plugin.builtins.security;

import java.util.List;
import java.util.Map;

public class SecurityPluginConfig {

    private List<String> ipWhitelist;
    private List<String> ipBlacklist;
    private Map<String, String> requiredHeaders;

    public List<String> getIpWhitelist() {
        return ipWhitelist;
    }

    public void setIpWhitelist(List<String> ipWhitelist) {
        this.ipWhitelist = ipWhitelist;
    }

    public List<String> getIpBlacklist() {
        return ipBlacklist;
    }

    public void setIpBlacklist(List<String> ipBlacklist) {
        this.ipBlacklist = ipBlacklist;
    }

    public Map<String, String> getRequiredHeaders() {
        return requiredHeaders;
    }

    public void setRequiredHeaders(Map<String, String> requiredHeaders) {
        this.requiredHeaders = requiredHeaders;
    }
}
