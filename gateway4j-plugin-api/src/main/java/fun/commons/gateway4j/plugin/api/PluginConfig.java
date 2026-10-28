package fun.commons.gateway4j.plugin.api;

public class PluginConfig {

    private final String pluginId;
    private final String config;
    private final long configVersion;

    public PluginConfig(String pluginId, String config, long configVersion) {
        this.pluginId = pluginId;
        this.config = config;
        this.configVersion = configVersion;
    }

    public String pluginId() {
        return pluginId;
    }

    public String config() {
        return config;
    }

    public long configVersion() {
        return configVersion;
    }
}
