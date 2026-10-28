package fun.commons.gateway4j.common.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginGroovyTest {

    @Test
    void defaultCompileStatus() {
        PluginGroovy groovy = PluginGroovy.builder().build();
        assertEquals("PENDING", groovy.getCompileStatus());
    }

    @Test
    void builderWithAllFields() {
        PluginGroovy groovy = PluginGroovy.builder()
                .pluginId(2L)
                .scriptContent("def run() { return 'ok' }")
                .scriptMd5("md5hash")
                .compileStatus("SUCCESS")
                .compileError(null)
                .build();

        assertEquals(2L, groovy.getPluginId());
        assertEquals("def run() { return 'ok' }", groovy.getScriptContent());
        assertEquals("SUCCESS", groovy.getCompileStatus());
        assertNull(groovy.getCompileError());
    }
}
