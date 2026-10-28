package fun.commons.gateway4j.plugin.builtins.request;

import java.util.List;
import java.util.Map;

public class RequestPluginConfig {

    private Map<String, String> addHeaders;
    private Map<String, String> replaceHeaders;
    private List<String> removeHeaders;
    private Map<String, String> addQueryParams;
    private List<String> removeQueryParams;
    private Map<String, String> addCookies;
    private List<String> removeCookies;

    public Map<String, String> getAddHeaders() { return addHeaders; }
    public void setAddHeaders(Map<String, String> addHeaders) { this.addHeaders = addHeaders; }
    public Map<String, String> getReplaceHeaders() { return replaceHeaders; }
    public void setReplaceHeaders(Map<String, String> replaceHeaders) { this.replaceHeaders = replaceHeaders; }
    public List<String> getRemoveHeaders() { return removeHeaders; }
    public void setRemoveHeaders(List<String> removeHeaders) { this.removeHeaders = removeHeaders; }
    public Map<String, String> getAddQueryParams() { return addQueryParams; }
    public void setAddQueryParams(Map<String, String> addQueryParams) { this.addQueryParams = addQueryParams; }
    public List<String> getRemoveQueryParams() { return removeQueryParams; }
    public void setRemoveQueryParams(List<String> removeQueryParams) { this.removeQueryParams = removeQueryParams; }
    public Map<String, String> getAddCookies() { return addCookies; }
    public void setAddCookies(Map<String, String> addCookies) { this.addCookies = addCookies; }
    public List<String> getRemoveCookies() { return removeCookies; }
    public void setRemoveCookies(List<String> removeCookies) { this.removeCookies = removeCookies; }
}
