package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.audit.annotation.Auditable;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.model.V2DebugReplayRequest;
import fun.commons.gateway4j.admin.service.DebugReplayService;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * V2 调试回放控制器单测 —— 对应契约 §4 S11a（docs/ui-v2/实施契约.md，
 * 2026-11-05 已裁决细则⑤）。
 *
 * <p><b>测试先行</b>：被测类尚未实现时本文件会使 admin 测试编译失败——预期流程，
 * C-agent 按本文件实现 {@code V2DebugController} 后由 R-agent 跑。</p>
 *
 * <p><b>契约固定</b>（V2RouteController 同款风格，/v1/v2/debug 属 v2 命名空间，
 * V2RouteController javadoc 已预留）：</p>
 * <pre>
 * &#64;RestController
 * &#64;RequestMapping("/v1/v2/debug")
 * &#64;RequiresToken("BEARER")
 * public class V2DebugController {
 *     &#64;PostMapping("/replay")
 *     &#64;Auditable(action = "debug_replay", targetType = "ROUTE")
 *     public ApiResponse&lt;Map&lt;String, Object&gt;&gt; replay(
 *             &#64;RequestParam("route_id") Long routeId,
 *             &#64;RequestBody V2DebugReplayRequest request) {
 *         return ApiResponse.success(debugReplayService.replay(request, routeId));  // 纯委托
 *     }
 * }
 * </pre>
 *
 * <p>route_id 走查询参数：契约固定 request record 只有 path/method/headers/
 * query/body 五分量，且端点为 POST /v1/v2/debug/replay，routeId 只能置于
 * URL；具体绑定方式（@RequestParam 名称 route_id）在此锁定供 S11b 前端调用。</p>
 */
@ExtendWith(MockitoExtension.class)
class V2DebugControllerTest {

    @Mock private DebugReplayService debugReplayService;

    @InjectMocks private V2DebugController controller;

    // ==================== C1 纯委托 ====================

    /** C1：service 返回桩 Map → ApiResponse.success 且 data 同引用透传、恰好委托一次。 */
    @Test
    void replayDelegatesToServiceAndWrapsInApiResponse() {
        V2DebugReplayRequest request = new V2DebugReplayRequest(
                "/api/users", "GET", Map.of(), Map.of(), null);
        Map<String, Object> stub = new LinkedHashMap<>();
        stub.put("status", 200);
        stub.put("simulate", Map.of("matched", true));
        when(debugReplayService.replay(request, 1L)).thenReturn(stub);

        ApiResponse<Map<String, Object>> resp = controller.replay(1L, request);

        assertNotNull(resp, "返回统一信封 ApiResponse");
        assertEquals(0, resp.getCode(), "成功信封 code=0");
        assertTrue(resp.isSuccess());
        assertSame(stub, resp.getData(), "data 与 service 返回值同引用透传（不做拷贝/改造）");
        verify(debugReplayService).replay(request, 1L);
        verifyNoMoreInteractions(debugReplayService);
    }

    // ==================== C2 异常不吞 ====================

    /** C2：service 抛 BusinessException → controller 原样向上抛（同实例）。 */
    @Test
    void businessExceptionFromServiceIsNotSwallowed() {
        V2DebugReplayRequest request = new V2DebugReplayRequest(
                "/api/users", "GET", Map.of(), Map.of(), null);
        BusinessException boom = new BusinessException(ErrorCode.SERVICE_UNAVAILABLE);
        when(debugReplayService.replay(request, 9L)).thenThrow(boom);

        BusinessException thrown = assertThrows(BusinessException.class,
                () -> controller.replay(9L, request), "controller 不得吞业务异常");

        assertSame(boom, thrown, "向上抛同异常实例");
        assertEquals(ErrorCode.SERVICE_UNAVAILABLE, thrown.getErrorCode());
        assertEquals(10607, thrown.getCode());
    }

    // ==================== C3 注解静态断言 ====================

    /** C3：类上 @RequestMapping("/v1/v2/debug") + @RequiresToken("BEARER")；
     *  replay 方法 @PostMapping("/replay") + @Auditable(action="debug_replay",
     *  targetType="ROUTE")，route_id 为查询参数、请求体为 V2DebugReplayRequest。 */
    @Test
    void classAndMethodAnnotationsMatchContract() throws Exception {
        RequestMapping classMapping = V2DebugController.class.getAnnotation(RequestMapping.class);
        assertNotNull(classMapping, "类上必须有 @RequestMapping");
        assertTrue(declaredPaths(classMapping.value(), classMapping.path())
                        .anyMatch("/v1/v2/debug"::equals),
                "类级路径必须是 /v1/v2/debug（v2 命名空间，S11b 前端调试台调用）");

        RequiresToken requiresToken = V2DebugController.class.getAnnotation(RequiresToken.class);
        assertNotNull(requiresToken, "类上必须有 @RequiresToken（framework4j-accesstoken）");
        assertEquals("BEARER", requiresToken.value(), "token 业务类型必须是 BEARER");

        Method method = V2DebugController.class.getMethod("replay", Long.class, V2DebugReplayRequest.class);
        assertEquals(ApiResponse.class, method.getReturnType(), "方法返回 ApiResponse<Map<String,Object>> 信封");

        PostMapping postMapping = method.getAnnotation(PostMapping.class);
        assertNotNull(postMapping, "replay 必须是 @PostMapping");
        assertTrue(declaredPaths(postMapping.value(), postMapping.path())
                        .anyMatch("/replay"::equals),
                "方法路径必须是 /replay（POST /v1/v2/debug/replay）");

        Auditable auditable = method.getAnnotation(Auditable.class);
        assertNotNull(auditable, "replay 必须有 @Auditable（framework4j-audit，调试回放必须留痕）");
        assertEquals("debug_replay", auditable.action(), "审计 action 必须是 debug_replay");
        assertEquals("ROUTE", auditable.targetType(), "审计 targetType 必须是 ROUTE");

        Parameter[] parameters = method.getParameters();
        assertEquals("route_id", requestParamName(parameters[0]),
                "routeId 必须绑定查询参数 route_id（request record 无 routeId 分量）");
        assertNotNull(parameters[1].getAnnotation(RequestBody.class),
                "请求体必须是 @RequestBody V2DebugReplayRequest");
    }

    /** 聚合注解 value/path 两个互为 @AliasFor 的属性（裸反射不合成别名，取并集）。 */
    private static Stream<String> declaredPaths(String[] value, String[] path) {
        return Stream.concat(
                Arrays.stream(value == null ? new String[0] : value),
                Arrays.stream(path == null ? new String[0] : path));
    }

    /** @RequestParam 的绑定名：value 与 name 互为别名，取非空者。 */
    private static String requestParamName(Parameter parameter) {
        RequestParam annotation = parameter.getAnnotation(RequestParam.class);
        if (annotation == null) {
            return null;
        }
        return !annotation.value().isEmpty() ? annotation.value() : annotation.name();
    }
}
