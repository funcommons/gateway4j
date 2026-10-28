package fun.commons.gateway4j.plugin.builtins.logging;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LogDesensitizerTest {

    private LoggingPluginConfig.DesensitizeRule rule(String field, String strategy) {
        LoggingPluginConfig.DesensitizeRule r = new LoggingPluginConfig.DesensitizeRule();
        r.setField(field);
        r.setStrategy(strategy);
        return r;
    }

    @Test
    void noRulesReturnsInput() {
        LogDesensitizer d = new LogDesensitizer(null);
        assertEquals("{\"name\":\"test\"}", d.desensitize("{\"name\":\"test\"}"));
    }

    @Test
    void emptyRulesReturnsInput() {
        LogDesensitizer d = new LogDesensitizer(List.of());
        assertEquals("{\"name\":\"test\"}", d.desensitize("{\"name\":\"test\"}"));
    }

    @Test
    void maskStrategy() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("password", "MASK")));
        String input = "{\"password\":\"secret123\"}";
        String result = d.desensitize(input);
        assertTrue(result.contains("***"));
        assertFalse(result.contains("secret123"));
    }

    @Test
    void replaceStrategy() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("phone", "REPLACE")));
        String input = "{\"phone\":\"13800138000\"}";
        String result = d.desensitize(input);
        assertTrue(result.contains("***"));
        assertFalse(result.contains("13800138000"));
    }

    @Test
    void md5Strategy() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("idCard", "MD5")));
        String input = "{\"idCard\":\"320123199001011234\"}";
        String result = d.desensitize(input);
        assertFalse(result.contains("320123199001011234"));
        assertTrue(result.contains(":\""));
        assertTrue(result.contains("\""));
    }

    @Test
    void emptyStrategy() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("token", "EMPTY")));
        String input = "{\"token\":\"abc123\"}";
        String result = d.desensitize(input);
        assertTrue(result.contains("\"token\":\"\""));
    }

    @Test
    void multipleRules() {
        LogDesensitizer d = new LogDesensitizer(List.of(
                rule("password", "REPLACE"),
                rule("phone", "MASK")));
        String input = "{\"password\":\"secret\",\"phone\":\"13800138000\"}";
        String result = d.desensitize(input);
        assertFalse(result.contains("secret"));
        assertFalse(result.contains("13800138000"));
    }

    @Test
    void nullInputReturnsNull() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("password", "MASK")));
        assertNull(d.desensitize(null));
    }

    @Test
    void nonExistentFieldLeavesInputUnchanged() {
        LogDesensitizer d = new LogDesensitizer(List.of(rule("nonexistent", "MASK")));
        String input = "{\"name\":\"test\"}";
        assertEquals(input, d.desensitize(input));
    }
}
