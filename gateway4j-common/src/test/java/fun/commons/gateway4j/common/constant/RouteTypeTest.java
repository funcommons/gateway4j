package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RouteTypeTest {

    @Test
    void codeValues() {
        assertEquals("DISPATCH", RouteType.DISPATCH.code());
        assertEquals("BACKEND", RouteType.BACKEND.code());
    }

    @Test
    void fromCode() {
        assertEquals(RouteType.DISPATCH, RouteType.fromCode("DISPATCH"));
        assertEquals(RouteType.BACKEND, RouteType.fromCode("BACKEND"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> RouteType.fromCode("UNKNOWN"));
    }

    @Test
    void allValuesHaveCode() {
        for (RouteType value : RouteType.values()) {
            assertNotNull(value.code());
            assertFalse(value.code().isEmpty());
        }
    }
}
