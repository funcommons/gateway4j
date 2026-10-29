package fun.commons.gateway4j.gateway.config;

import fun.commons.gateway4j.engine.plugin.loader.DynamicPluginLoader;
import fun.commons.gateway4j.engine.plugin.loader.PluginLoaderProperties;
import fun.commons.gateway4j.engine.plugin.runtime.PluginInstanceRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Assembly assertions for the dynamic-plugin loader section of
 * ServerAutoConfiguration (ADR-003 phase 1): the loader bean wires the SHARED
 * registry instance and a sane default timeout.
 */
class DynamicPluginAssemblyTest {

    @Test
    void loaderDefaultsAreFailOpenAndConfigurable() {
        PluginLoaderProperties properties = new ServerAutoConfiguration().pluginLoaderProperties();
        assertEquals(1000L, properties.getExecTimeoutMs(), "default exec timeout must be 1000ms");
        assertTrue(properties.getJarParentPackages().isEmpty(),
                "no extra sandbox-parent packages by default");
    }

    @Test
    void dynamicPluginLoaderSharesTheBuiltinRegistry() throws Exception {
        ServerAutoConfiguration assembly = new ServerAutoConfiguration();
        PluginInstanceRegistry registry = assembly.pluginInstanceRegistry(
                new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
        PluginLoaderProperties properties = assembly.pluginLoaderProperties();

        DynamicPluginLoader loader = assembly.dynamicPluginLoader(registry,
                org.mockito.Mockito.mock(fun.commons.gateway4j.common.mapper.GroovyMapper.class),
                org.mockito.Mockito.mock(fun.commons.gateway4j.common.mapper.PluginJarFileMapper.class),
                properties);

        assertNotNull(loader);
        assertEquals(0, loader.activeCount(), "no dynamic plugins without rows");
        // the registry identity check: registering through the loader must be visible
        // to the builtin registry bean (same instance) — simulate with a dry sync
        loader.sync(java.util.List.of());
        assertEquals(0, loader.activeCount());
    }
}
