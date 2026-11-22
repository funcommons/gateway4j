package fun.commons.gateway4j.plugin.builtins.watermark;

public class WatermarkPluginConfig {

    private boolean enabled = true;
    private String org = "企业";
    private String color = "rgba(200, 128, 128, 0.10)";
    private int width = 360;
    private int height = 180;
    private int fontSize = 24;
    private int rotate = -20;
    private long maxBodyLength = 1024 * 1024;
    private String scriptUrl;
    /** 会话 cookie 名，缺省对齐 DingTalkPluginConfig 的 fu-gw-token；脚本据此读 JWT payload 个性化文案。 */
    private String sessionCookieName = "fu-gw-token";
    /** 是否剥离 Content-Security-Policy 响应头；缺省 false=保留，仅在注入路径生效。 */
    private boolean stripCsp = false;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getOrg() { return org; }
    public void setOrg(String org) { this.org = org; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public int getWidth() { return width; }
    public void setWidth(int width) { this.width = width; }
    public int getHeight() { return height; }
    public void setHeight(int height) { this.height = height; }
    public int getFontSize() { return fontSize; }
    public void setFontSize(int fontSize) { this.fontSize = fontSize; }
    public int getRotate() { return rotate; }
    public void setRotate(int rotate) { this.rotate = rotate; }
    public long getMaxBodyLength() { return maxBodyLength; }
    public void setMaxBodyLength(long maxBodyLength) { this.maxBodyLength = maxBodyLength; }
    public String getScriptUrl() { return scriptUrl; }
    public void setScriptUrl(String scriptUrl) { this.scriptUrl = scriptUrl; }
    public String getSessionCookieName() { return sessionCookieName; }
    public void setSessionCookieName(String sessionCookieName) { this.sessionCookieName = sessionCookieName; }
    public boolean isStripCsp() { return stripCsp; }
    public void setStripCsp(boolean stripCsp) { this.stripCsp = stripCsp; }
}
