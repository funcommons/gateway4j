package fun.commons.gateway4j.plugin.builtins.sentinel;

import java.util.List;

public class SentinelPluginConfig {

    private String resourceMode;
    private List<SentinelFlowRule> flowRules;
    private List<SentinelDegradeRule> degradeRules;

    public String getResourceMode() { return resourceMode; }
    public void setResourceMode(String resourceMode) { this.resourceMode = resourceMode; }
    public List<SentinelFlowRule> getFlowRules() { return flowRules; }
    public void setFlowRules(List<SentinelFlowRule> flowRules) { this.flowRules = flowRules; }
    public List<SentinelDegradeRule> getDegradeRules() { return degradeRules; }
    public void setDegradeRules(List<SentinelDegradeRule> degradeRules) { this.degradeRules = degradeRules; }
}
