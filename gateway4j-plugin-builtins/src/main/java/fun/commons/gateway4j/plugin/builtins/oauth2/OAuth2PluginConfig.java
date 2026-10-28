package fun.commons.gateway4j.plugin.builtins.oauth2;

public class OAuth2PluginConfig {

    private String clientId;
    private String clientSecret;
    private String authorizationUri;
    private String tokenUri;
    private String redirectUri;
    private String tokenHeader;
    private String tokenQuery;
    private String userInfoUri;

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    public String getAuthorizationUri() { return authorizationUri; }
    public void setAuthorizationUri(String authorizationUri) { this.authorizationUri = authorizationUri; }
    public String getTokenUri() { return tokenUri; }
    public void setTokenUri(String tokenUri) { this.tokenUri = tokenUri; }
    public String getRedirectUri() { return redirectUri; }
    public void setRedirectUri(String redirectUri) { this.redirectUri = redirectUri; }
    public String getTokenHeader() { return tokenHeader; }
    public void setTokenHeader(String tokenHeader) { this.tokenHeader = tokenHeader; }
    public String getTokenQuery() { return tokenQuery; }
    public void setTokenQuery(String tokenQuery) { this.tokenQuery = tokenQuery; }
    public String getUserInfoUri() { return userInfoUri; }
    public void setUserInfoUri(String userInfoUri) { this.userInfoUri = userInfoUri; }
}
