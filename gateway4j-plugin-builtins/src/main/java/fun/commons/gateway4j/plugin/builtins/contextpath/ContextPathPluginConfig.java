package fun.commons.gateway4j.plugin.builtins.contextpath;

public class ContextPathPluginConfig {

    private String addPrefix;
    private Integer stripPrefix;
    private String rewriteContextPath;

    public String getAddPrefix() {
        return addPrefix;
    }

    public void setAddPrefix(String addPrefix) {
        this.addPrefix = addPrefix;
    }

    public Integer getStripPrefix() {
        return stripPrefix;
    }

    public void setStripPrefix(Integer stripPrefix) {
        this.stripPrefix = stripPrefix;
    }

    public String getRewriteContextPath() {
        return rewriteContextPath;
    }

    public void setRewriteContextPath(String rewriteContextPath) {
        this.rewriteContextPath = rewriteContextPath;
    }
}
