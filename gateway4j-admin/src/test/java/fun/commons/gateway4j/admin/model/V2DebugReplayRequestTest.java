package fun.commons.gateway4j.admin.model;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * S11a 调试回放请求体 DTO 形状契约 —— docs/ui-v2/实施契约.md S11：
 * {@code record V2DebugReplayRequest(path, method, headers, query, body)}。
 *
 * <p>S11b 前端调试台（POST /v1/v2/debug/replay 的 JSON body）与
 * {@code RouteSimulateService.simulate(path, method, headers, query)} 的
 * 入参透传都依赖这五个分量，名称 / 顺序 / 类型为契约，逐项锁定。</p>
 *
 * <p><b>测试先行</b>：record 尚未实现时本文件会使 admin 测试编译失败——预期 RED。</p>
 */
class V2DebugReplayRequestTest {

    @Test
    void recordComponentsMatchContractOrderAndTypes() {
        var components = V2DebugReplayRequest.class.getRecordComponents();
        assertNotNull(components, "必须是 record");
        assertEquals(5, components.length);
        assertEquals("path", components[0].getName());
        assertEquals(String.class, components[0].getType());
        assertEquals("method", components[1].getName());
        assertEquals(String.class, components[1].getType());
        assertEquals("headers", components[2].getName());
        assertEquals("java.util.Map<java.lang.String, java.lang.String>",
                components[2].getGenericType().getTypeName(),
                "headers 必须是 Map<String,String>（与 RouteSimulateService.simulate 入参对齐）");
        assertEquals("query", components[3].getName());
        assertEquals("java.util.Map<java.lang.String, java.lang.String>",
                components[3].getGenericType().getTypeName());
        assertEquals("body", components[4].getName());
        assertEquals(String.class, components[4].getType());
    }

    @Test
    void canonicalConstructorAndAccessors() {
        V2DebugReplayRequest request = new V2DebugReplayRequest(
                "/api/users", "POST",
                Map.of("X-Custom-Trace", "t1"), Map.of("a", "1"), "{\"k\":1}");

        assertEquals("/api/users", request.path());
        assertEquals("POST", request.method());
        assertEquals(Map.of("X-Custom-Trace", "t1"), request.headers());
        assertEquals(Map.of("a", "1"), request.query());
        assertEquals("{\"k\":1}", request.body());
    }

    @Test
    void nullBodyAndEmptyMapsAreAllowed() {
        // GET 无 body 是最常见的回放形态：不得强迫非空。
        V2DebugReplayRequest request = new V2DebugReplayRequest("/api/users", "GET", Map.of(), Map.of(), null);
        assertNull(request.body());
        assertTrue(request.headers().isEmpty());
        assertTrue(request.query().isEmpty());
    }
}
