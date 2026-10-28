package fun.commons.gateway4j.plugin.builtins.dingtalk;

import java.util.List;

public class DingTalkPluginConfig {

    private boolean enabled = true;
    private String corpId;
    private String appKey;
    private String appSecret;
    private String loginServer;
    private String cookieName = "fu-gw-token";
    private List<String> excludePaths;
    private List<String> excludeFileExt;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getCorpId() { return corpId; }
    public void setCorpId(String corpId) { this.corpId = corpId; }
    public String getAppKey() { return appKey; }
    public void setAppKey(String appKey) { this.appKey = appKey; }
    public String getAppSecret() { return appSecret; }
    public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
    public String getLoginServer() { return loginServer; }
    public void setLoginServer(String loginServer) { this.loginServer = loginServer; }
    public String getCookieName() { return cookieName; }
    public void setCookieName(String cookieName) { this.cookieName = cookieName; }
    public List<String> getExcludePaths() { return excludePaths; }
    public void setExcludePaths(List<String> excludePaths) { this.excludePaths = excludePaths; }
    public List<String> getExcludeFileExt() { return excludeFileExt; }
    public void setExcludeFileExt(List<String> excludeFileExt) { this.excludeFileExt = excludeFileExt; }
}
