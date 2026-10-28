package fun.commons.gateway4j.plugin.builtins.modifyresponse;

import java.util.List;
import java.util.Map;

public class ModifyResponsePluginConfig {

    private Map<String, String> addHeaders;
    private Map<String, String> replaceHeaders;
    private List<String> removeHeaders;
    private Integer statusCode;
    private Map<String, Object> addBodyKeys;
    private Map<String, String> replaceBodyKeys;
    private List<String> removeBodyKeys;

    public Map<String, String> getAddHeaders() { return addHeaders; }
    public void setAddHeaders(Map<String, String> addHeaders) { this.addHeaders = addHeaders; }
    public Map<String, String> getReplaceHeaders() { return replaceHeaders; }
    public void setReplaceHeaders(Map<String, String> replaceHeaders) { this.replaceHeaders = replaceHeaders; }
    public List<String> getRemoveHeaders() { return removeHeaders; }
    public void setRemoveHeaders(List<String> removeHeaders) { this.removeHeaders = removeHeaders; }
    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer statusCode) { this.statusCode = statusCode; }
    public Map<String, Object> getAddBodyKeys() { return addBodyKeys; }
    public void setAddBodyKeys(Map<String, Object> addBodyKeys) { this.addBodyKeys = addBodyKeys; }
    public Map<String, String> getReplaceBodyKeys() { return replaceBodyKeys; }
    public void setReplaceBodyKeys(Map<String, String> replaceBodyKeys) { this.replaceBodyKeys = replaceBodyKeys; }
    public List<String> getRemoveBodyKeys() { return removeBodyKeys; }
    public void setRemoveBodyKeys(List<String> removeBodyKeys) { this.removeBodyKeys = removeBodyKeys; }
}
