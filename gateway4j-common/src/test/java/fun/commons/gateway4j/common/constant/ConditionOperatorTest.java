package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConditionOperatorTest {

    @Test
    void codeValues() {
        assertEquals("EQ", ConditionOperator.EQ.code());
        assertEquals("NE", ConditionOperator.NE.code());
        assertEquals("CONTAINS", ConditionOperator.CONTAINS.code());
        assertEquals("REGEX", ConditionOperator.REGEX.code());
        assertEquals("EXISTS", ConditionOperator.EXISTS.code());
        assertEquals("GT", ConditionOperator.GT.code());
        assertEquals("LT", ConditionOperator.LT.code());
    }

    @Test
    void fromCode() {
        assertEquals(ConditionOperator.EQ, ConditionOperator.fromCode("EQ"));
        assertEquals(ConditionOperator.REGEX, ConditionOperator.fromCode("REGEX"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> ConditionOperator.fromCode("UNKNOWN"));
    }
}
