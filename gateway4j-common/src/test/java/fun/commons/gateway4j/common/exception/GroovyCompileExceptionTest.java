package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GroovyCompileExceptionTest {

    @Test
    void messageContainsScriptName() {
        GroovyCompileException ex = new GroovyCompileException("auth-check.groovy", "line 5: unexpected token");
        assertEquals(ErrorCode.PLUGIN_LOAD_FAILED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("auth-check.groovy"));
        assertEquals("line 5: unexpected token", ex.getCompileError());
    }
}
