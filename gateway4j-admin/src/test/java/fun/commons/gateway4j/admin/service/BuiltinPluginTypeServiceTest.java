package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class BuiltinPluginTypeServiceTest {

    private BuiltinPluginTypeService service;

    @BeforeEach
    void setUp() {
        service = new BuiltinPluginTypeService(new BuiltinPluginTypeRegistry(), new ObjectMapper());
    }

    @Test
    void listTypesReturns20Plus() {
        List<Map<String, Object>> types = service.listTypes();
        assertTrue(types.size() >= 20);
    }

    @Test
    void listTypesContainsSchema() {
        List<Map<String, Object>> types = service.listTypes();
        Map<String, Object> jwt = types.stream()
                .filter(t -> "jwt".equals(t.get("plugin_id")))
                .findFirst().orElseThrow();
        assertNotNull(jwt.get("config_schema"));
        assertEquals("PRE", jwt.get("plugin_phase"));
        // D21：config_schema 必须是 JSON 对象（前端按 .properties 读），不能是字符串
        assertInstanceOf(JsonNode.class, jwt.get("config_schema"));
        JsonNode schema = (JsonNode) jwt.get("config_schema");
        assertTrue(schema.has("type"));
        assertTrue(schema.has("properties"));
    }

    @Test
    void getSchemaKnown() {
        Map<String, Object> schema = service.getSchema("rate-limiter");
        assertEquals("rate-limiter", schema.get("plugin_id"));
        assertNotNull(schema.get("config_schema"));
    }

    @Test
    void getSchemaUnknownThrows() {
        assertThrows(BusinessException.class, () -> service.getSchema("nope"));
    }

    @Test
    void validateConfigValid() {
        Map<String, Object> result = service.validateConfig("jwt", "{\"secretKey\":\"x\"}");
        assertEquals(true, result.get("is_valid"));
    }

    @Test
    void validateConfigInvalidJson() {
        Map<String, Object> result = service.validateConfig("jwt", "{bad json");
        assertEquals(false, result.get("is_valid"));
        assertFalse(((List<?>) result.get("errors")).isEmpty());
    }

    @Test
    void validateConfigUnknownPlugin() {
        Map<String, Object> result = service.validateConfig("nope", "{}");
        assertEquals(false, result.get("is_valid"));
    }
}
