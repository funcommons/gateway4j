package fun.commons.gateway4j.plugin.builtins.sentinel;

public class SentinelDegradeRule {

    private String resource;
    private Integer grade;
    private double count;
    private Long timeWindow;
    private Integer minRequestAmount;
    private Integer statIntervalMs;

    public String getResource() { return resource; }
    public void setResource(String resource) { this.resource = resource; }
    public Integer getGrade() { return grade; }
    public void setGrade(Integer grade) { this.grade = grade; }
    public double getCount() { return count; }
    public void setCount(double count) { this.count = count; }
    public Long getTimeWindow() { return timeWindow; }
    public void setTimeWindow(Long timeWindow) { this.timeWindow = timeWindow; }
    public Integer getMinRequestAmount() { return minRequestAmount; }
    public void setMinRequestAmount(Integer minRequestAmount) { this.minRequestAmount = minRequestAmount; }
    public Integer getStatIntervalMs() { return statIntervalMs; }
    public void setStatIntervalMs(Integer statIntervalMs) { this.statIntervalMs = statIntervalMs; }
}
