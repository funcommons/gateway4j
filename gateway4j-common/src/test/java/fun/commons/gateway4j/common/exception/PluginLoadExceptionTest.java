package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PluginLoadExceptionTest {

    @Test
    void constructorWithDetail() {
        PluginLoadException ex = new PluginLoadException("JAR文件不存在: /plugins/test.jar");
        assertEquals(ErrorCode.PLUGIN_LOAD_FAILED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("JAR文件不存在"));
    }

    @Test
    void constructorWithCause() {
        RuntimeException cause = new RuntimeException("ClassNotFoundException");
        PluginLoadException ex = new PluginLoadException("加载失败", cause);
        assertEquals(cause, ex.getCause());
    }
}
