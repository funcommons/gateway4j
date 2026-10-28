package fun.commons.gateway4j.plugin.builtins.basicauth;

import java.util.Map;

public class BasicAuthPluginConfig {

    private Map<String, String> accounts;

    public Map<String, String> getAccounts() {
        return accounts;
    }

    public void setAccounts(Map<String, String> accounts) {
        this.accounts = accounts;
    }
}
