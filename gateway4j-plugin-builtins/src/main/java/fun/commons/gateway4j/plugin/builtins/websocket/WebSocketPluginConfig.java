package fun.commons.gateway4j.plugin.builtins.websocket;

public class WebSocketPluginConfig {

    private String upstreamUrl;
    private int maxFrameSize = 65536;
    private boolean proxyHeaders = true;

    public String getUpstreamUrl() { return upstreamUrl; }
    public void setUpstreamUrl(String upstreamUrl) { this.upstreamUrl = upstreamUrl; }
    public int getMaxFrameSize() { return maxFrameSize; }
    public void setMaxFrameSize(int maxFrameSize) { this.maxFrameSize = maxFrameSize; }
    public boolean isProxyHeaders() { return proxyHeaders; }
    public void setProxyHeaders(boolean proxyHeaders) { this.proxyHeaders = proxyHeaders; }
}
