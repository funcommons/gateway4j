package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginJarTest {

    @Test
    void builderWithAllFields() {
        PluginJar jar = PluginJar.builder()
                .pluginId(1L)
                .jarPath("/plugins/my-plugin.jar")
                .jarMd5("abc123def456")
                .mainClass("com.example.MyPlugin")
                .build();

        assertEquals(1L, jar.getPluginId());
        assertEquals("/plugins/my-plugin.jar", jar.getJarPath());
        assertEquals("abc123def456", jar.getJarMd5());
        assertEquals("com.example.MyPlugin", jar.getMainClass());
    }
}
