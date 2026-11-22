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
    /** §1 state CSRF HMAC 密钥；缺省时从 appSecret 派生（SHA-256(appSecret) 32 字节）。 */
    private String stateSecret;
    /** §1 state 时效（秒），缺省 300。 */
    private long stateTimeout = 300;
    /** §4 会话 JWT HS256 密钥；缺省回落 appSecret（服务端日志警告一次）。 */
    private String jwtSecret;
    /** §4 会话 JWT 有效期（秒），缺省 43200=12h。 */
    private long tokenTimeout = 43200;
    /** §5 logout 路径前缀，可空缺省 ""，即精确匹配 {basePath}/logout。 */
    private String basePath;
    /** §5 logout 后跳转地址，可空：空→200 JSON，非空→302 该址。 */
    private String logoutRedirect;
    /** 出站 API 域名前缀，缺省 https://api.dingtalk.com（路径不变，仅前缀可配；尾 '/' 拼接前剥除防双斜杠）。 */
    private String apiBaseUrl = "https://api.dingtalk.com";

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
    public String getStateSecret() { return stateSecret; }
    public void setStateSecret(String stateSecret) { this.stateSecret = stateSecret; }
    public long getStateTimeout() { return stateTimeout; }
    public void setStateTimeout(long stateTimeout) { this.stateTimeout = stateTimeout; }
    public String getJwtSecret() { return jwtSecret; }
    public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }
    public long getTokenTimeout() { return tokenTimeout; }
    public void setTokenTimeout(long tokenTimeout) { this.tokenTimeout = tokenTimeout; }
    public String getBasePath() { return basePath; }
    public void setBasePath(String basePath) { this.basePath = basePath; }
    public String getLogoutRedirect() { return logoutRedirect; }
    public void setLogoutRedirect(String logoutRedirect) { this.logoutRedirect = logoutRedirect; }
    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String apiBaseUrl) { this.apiBaseUrl = apiBaseUrl; }
}
