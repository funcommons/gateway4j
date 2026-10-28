package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DepthExceededExceptionTest {

    @Test
    void messageContainsDepth() {
        DepthExceededException ex = new DepthExceededException(6);
        assertEquals(ErrorCode.DEPTH_EXCEEDED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("6"));
        assertTrue(ex.getMessage().contains("5"));
    }
}
