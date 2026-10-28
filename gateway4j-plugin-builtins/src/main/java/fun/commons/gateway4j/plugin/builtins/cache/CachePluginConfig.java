package fun.commons.gateway4j.plugin.builtins.cache;

public class CachePluginConfig {

    private int ttlSeconds = 300;
    private int maxBodySize = 1024 * 1024;
    private String cacheKeyTemplate;
    private String mode;

    public int getTtlSeconds() { return ttlSeconds; }
    public void setTtlSeconds(int ttlSeconds) { this.ttlSeconds = ttlSeconds; }
    public int getMaxBodySize() { return maxBodySize; }
    public void setMaxBodySize(int maxBodySize) { this.maxBodySize = maxBodySize; }
    public String getCacheKeyTemplate() { return cacheKeyTemplate; }
    public void setCacheKeyTemplate(String cacheKeyTemplate) { this.cacheKeyTemplate = cacheKeyTemplate; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
}
