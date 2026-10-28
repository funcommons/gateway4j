package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RouteStatusTest {

    @Test
    void codeValues() {
        assertEquals("DRAFT", RouteStatus.DRAFT.code());
        assertEquals("PUBLISHED", RouteStatus.PUBLISHED.code());
        assertEquals("OFFLINE", RouteStatus.OFFLINE.code());
        assertEquals("CHANGING", RouteStatus.CHANGING.code());
    }

    @Test
    void fromCode() {
        assertEquals(RouteStatus.DRAFT, RouteStatus.fromCode("DRAFT"));
        assertEquals(RouteStatus.PUBLISHED, RouteStatus.fromCode("PUBLISHED"));
    }

    @Test
    void fromCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> RouteStatus.fromCode("UNKNOWN"));
    }
}
