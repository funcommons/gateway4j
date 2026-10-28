package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConditionTypeTest {

    @Test
    void codeValues() {
        assertEquals("HEADER", ConditionType.HEADER.code());
        assertEquals("PATH", ConditionType.PATH.code());
        assertEquals("QUERY", ConditionType.QUERY.code());
        assertEquals("BODY", ConditionType.BODY.code());
        assertEquals("GROOVY", ConditionType.GROOVY.code());
    }

    @Test
    void fromCode() {
        assertEquals(ConditionType.HEADER, ConditionType.fromCode("HEADER"));
        assertEquals(ConditionType.GROOVY, ConditionType.fromCode("GROOVY"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> ConditionType.fromCode("UNKNOWN"));
    }
}
