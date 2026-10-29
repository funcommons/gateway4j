package fun.commons.gateway4j.engine.plugin.loader;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Dynamic-plugin loader settings ({@code gateway4j.engine.plugin-loader}).
 */
@ConfigurationProperties("gateway4j.engine.plugin-loader")
public class PluginLoaderProperties {

    /**
     * Wall-time bound for every dynamic plugin execution (GROOVY / JAR). On
     * timeout the instance throws and the existing chain semantics apply
     * (fail-open, or 503 short-circuit when the row sets on_error=close).
     * Default 1000ms.
     */
    private long execTimeoutMs = 1000;

    /**
     * Extra package prefixes the JAR-plugin sandboxed parent classloader exposes
     * BEYOND the default (plugin-api + common + web/reactor/slf4j). Widening this
     * weakens ADR-003 isolation — prefer shipping the dependency inside the
     * plugin jar. e.g. {@code com.fasterxml.jackson.}
     */
    private List<String> jarParentPackages = new ArrayList<>();

    public long getExecTimeoutMs() {
        return execTimeoutMs;
    }

    public void setExecTimeoutMs(long execTimeoutMs) {
        this.execTimeoutMs = execTimeoutMs;
    }

    public List<String> getJarParentPackages() {
        return jarParentPackages;
    }

    public void setJarParentPackages(List<String> jarParentPackages) {
        this.jarParentPackages = jarParentPackages;
    }
}
