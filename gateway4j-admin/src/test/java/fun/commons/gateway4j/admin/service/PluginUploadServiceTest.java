package fun.commons.gateway4j.admin.service;

import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class PluginUploadServiceTest {

    private final PluginUploadService service = new PluginUploadService(null, null);

    @Test
    void validateGroovyValid() {
        Map<String, Object> result = service.validateGroovy("def x = 1\nreturn x");
        assertEquals(true, result.get("is_valid"));
    }

    @Test
    void validateGroovyInvalid() {
        Map<String, Object> result = service.validateGroovy("def x = {");
        assertEquals(false, result.get("is_valid"));
    }

    @Test
    void validateGroovyBlank() {
        Map<String, Object> result = service.validateGroovy("  ");
        assertEquals(false, result.get("is_valid"));
        assertEquals("脚本内容不能为空", result.get("error_message"));
    }

    @Test
    void validateGroovyNull() {
        Map<String, Object> result = service.validateGroovy(null);
        assertEquals(false, result.get("is_valid"));
    }
}
