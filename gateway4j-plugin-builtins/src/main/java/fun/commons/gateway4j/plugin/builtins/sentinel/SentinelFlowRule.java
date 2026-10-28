package fun.commons.gateway4j.plugin.builtins.sentinel;

public class SentinelFlowRule {

    private String resource;
    private int count;
    private Integer grade;
    private String limitApp;

    public String getResource() { return resource; }
    public void setResource(String resource) { this.resource = resource; }
    public int getCount() { return count; }
    public void setCount(int count) { this.count = count; }
    public Integer getGrade() { return grade; }
    public void setGrade(Integer grade) { this.grade = grade; }
    public String getLimitApp() { return limitApp; }
    public void setLimitApp(String limitApp) { this.limitApp = limitApp; }
}
