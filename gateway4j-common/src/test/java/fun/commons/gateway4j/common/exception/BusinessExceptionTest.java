package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BusinessExceptionTest {

    @Test
    void constructorWithErrorCode() {
        BusinessException ex = new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        assertEquals(ErrorCode.ROUTE_NOT_FOUND, ex.getErrorCode());
        assertEquals("路由未找到", ex.getMessage());
        assertNull(ex.getDetail());
        assertEquals(10601, ex.getCode());
    }

    @Test
    void constructorWithErrorCodeAndDetail() {
        BusinessException ex = new BusinessException(ErrorCode.PLUGIN_EXECUTION_FAILED, "security插件执行失败");
        assertEquals(ErrorCode.PLUGIN_EXECUTION_FAILED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("security插件执行失败"));
        assertEquals("security插件执行失败", ex.getDetail());
    }

    @Test
    void constructorWithErrorCodeAndCause() {
        RuntimeException cause = new RuntimeException("connection refused");
        BusinessException ex = new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, cause);
        assertEquals(ErrorCode.SERVICE_UNAVAILABLE, ex.getErrorCode());
        assertEquals(cause, ex.getCause());
    }
}
