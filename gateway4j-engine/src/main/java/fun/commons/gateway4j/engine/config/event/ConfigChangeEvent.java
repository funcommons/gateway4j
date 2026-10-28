package fun.commons.gateway4j.engine.config.event;

import org.springframework.context.ApplicationEvent;

public class ConfigChangeEvent extends ApplicationEvent {

    private final String configType;
    private final Long configId;
    private final Long configVersion;
    private final String changeType;

    public ConfigChangeEvent(Object source, String configType, Long configId,
                             Long configVersion, String changeType) {
        super(source);
        this.configType = configType;
        this.configId = configId;
        this.configVersion = configVersion;
        this.changeType = changeType;
    }

    public String getConfigType() {
        return configType;
    }

    public Long getConfigId() {
        return configId;
    }

    public Long getConfigVersion() {
        return configVersion;
    }

    public String getChangeType() {
        return changeType;
    }
}
