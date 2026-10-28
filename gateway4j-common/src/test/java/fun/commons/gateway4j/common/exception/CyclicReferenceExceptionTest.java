package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CyclicReferenceExceptionTest {

    @Test
    void messageContainsDetail() {
        CyclicReferenceException ex = new CyclicReferenceException("route-1 -> route-2 -> route-1");
        assertEquals(ErrorCode.CYCLIC_REFERENCE, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("route-1 -> route-2 -> route-1"));
    }
}
