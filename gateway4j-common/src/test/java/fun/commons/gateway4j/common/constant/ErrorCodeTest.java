package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ErrorCodeTest {

    @Test
    void codeValues() {
        assertEquals(10601, ErrorCode.ROUTE_NOT_FOUND.code());
        assertEquals(10608, ErrorCode.PLUGIN_NOT_FOUND.code());
        assertEquals(10602, ErrorCode.PLUGIN_EXECUTION_FAILED.code());
        assertEquals(10603, ErrorCode.CYCLIC_REFERENCE.code());
        assertEquals(10604, ErrorCode.DEPTH_EXCEEDED.code());
        assertEquals(10605, ErrorCode.CONFIG_SYNC_FAILED.code());
        assertEquals(10606, ErrorCode.PLUGIN_LOAD_FAILED.code());
        assertEquals(10607, ErrorCode.SERVICE_UNAVAILABLE.code());
        assertEquals(10699, ErrorCode.ENGINE_INTERNAL_ERROR.code());
    }

    @Test
    void codeStr() {
        assertEquals("10601", ErrorCode.ROUTE_NOT_FOUND.codeStr());
        assertEquals("10699", ErrorCode.ENGINE_INTERNAL_ERROR.codeStr());
        assertEquals("10402", ErrorCode.ROUTE_VERSION_CONFLICT.codeStr());
    }

    @Test
    void allCodesHaveNonEmptyMessage() {
        for (ErrorCode value : ErrorCode.values()) {
            assertNotNull(value.message(), "ErrorCode." + value.name() + " has null message");
            assertFalse(value.message().isEmpty(), "ErrorCode." + value.name() + " has empty message");
        }
    }

    @Test
    void codesIn106xxRange() {
        // 例外：ROUTE_VERSION_CONFLICT（P1-5 乐观锁）固定 10402 —— 跨 agent 契约
        // （前端按此码识别"请刷新"弹窗），且与 framework4j ApiCode.STATE_CONFLICT(10402)
        // 同码同义（状态冲突），API_CONTRACT §2.5 错误码表已含 10402。
        var contractExceptions = java.util.Set.of(ErrorCode.ROUTE_VERSION_CONFLICT);
        for (ErrorCode value : ErrorCode.values()) {
            if (contractExceptions.contains(value)) {
                continue;
            }
            assertTrue(value.code() >= 10600 && value.code() <= 10699,
                    "ErrorCode." + value.name() + " code " + value.code() + " not in 106xx range");
        }
    }

    @Test
    void codesAreUnique() {
        long distinctCount = java.util.Arrays.stream(ErrorCode.values())
                .map(ErrorCode::code)
                .distinct()
                .count();
        assertEquals(ErrorCode.values().length, distinctCount, "ErrorCode codes must be unique");
    }
}
