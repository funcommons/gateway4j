package fun.commons.gateway4j.plugin.builtins.parammapping;

import java.util.List;
import java.util.Set;

public class ParamMappingPluginConfig {

    private Set<String> removeParameterKeys;
    private List<ParamMapInfo> replaceParameterKeys;
    private List<ParamMapInfo> addParameterKeys;

    public Set<String> getRemoveParameterKeys() {
        return removeParameterKeys;
    }

    public void setRemoveParameterKeys(Set<String> removeParameterKeys) {
        this.removeParameterKeys = removeParameterKeys;
    }

    public List<ParamMapInfo> getReplaceParameterKeys() {
        return replaceParameterKeys;
    }

    public void setReplaceParameterKeys(List<ParamMapInfo> replaceParameterKeys) {
        this.replaceParameterKeys = replaceParameterKeys;
    }

    public List<ParamMapInfo> getAddParameterKeys() {
        return addParameterKeys;
    }

    public void setAddParameterKeys(List<ParamMapInfo> addParameterKeys) {
        this.addParameterKeys = addParameterKeys;
    }
}
