package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.RouteDecisionTreeService;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * V2 路由控制器单测 —— 对应契约 §4 S7a（docs/ui-v2/实施契约.md + S7a 已裁决接口契约）。
 *
 * <p><b>测试先行</b>：被测类尚未实现时本文件会使 admin 测试编译失败——这是预期流程，
 * C-agent 按本文件实现 {@code V2RouteController} 后由 R-agent 跑。</p>
 *
 * <p><b>契约固定</b>（与 RouteController/MonitorController 同款风格）：
 * <pre>
 * &#64;RestController
 * &#64;RequestMapping("/v1/v2/routes")
 * &#64;RequiresToken("BEARER")
 * public class V2RouteController {
 *     public V2RouteController(RouteDecisionTreeService decisionTreeService) { ... }
 *     &#64;GetMapping("/{id}/decision-tree")
 *     public ApiResponse&lt;Map&lt;String, Object&gt;&gt; decisionTree(&#64;PathVariable Long id) {
 *         return ApiResponse.success(decisionTreeService.decisionTree(id));  // 纯委托
 *     }
 * }
 * </pre>
 *
 * <p>类级路径 {@code /v1/v2/routes} 是 S7 决策树与 S11 /v1/v2/debug 共用的 v2 命名空间
 * （RouteController 类级 /v1/routes 拼不出 /v1/v2，故必须新建控制器）；鉴权沿用类级
 * {@code @RequiresToken("BEARER")}。业务异常不吞（GlobalExceptionHandler 统一转信封）。</p>
 */
@ExtendWith(MockitoExtension.class)
class V2RouteControllerTest {

    @Mock private RouteDecisionTreeService decisionTreeService;

    @InjectMocks private V2RouteController controller;

    // ==================== C1 纯委托 ====================

    /** C1：service 返回桩 Map → controller 返回 ApiResponse.success 且 data 同引用透传、恰好委托一次。 */
    @Test
    void decisionTreeDelegatesToServiceAndWrapsInApiResponse() {
        Map<String, Object> stub = new LinkedHashMap<>();
        stub.put("route_id", "1");
        stub.put("route_name", "gw-root");
        stub.put("children", java.util.List.of());
        when(decisionTreeService.decisionTree(1L)).thenReturn(stub);

        ApiResponse<Map<String, Object>> resp = controller.decisionTree(1L);

        assertNotNull(resp, "返回统一信封 ApiResponse");
        assertEquals(0, resp.getCode(), "成功信封 code=0");
        assertTrue(resp.isSuccess());
        assertSame(stub, resp.getData(), "data 与 service 返回值同引用透传（不做拷贝/改造）");
        verify(decisionTreeService).decisionTree(1L);
        verifyNoMoreInteractions(decisionTreeService);
    }

    // ==================== C2 异常不吞 ====================

    /** C2：service 抛 BusinessException → controller 原样向上抛（同实例），由全局异常处理器转信封。 */
    @Test
    void businessExceptionFromServiceIsNotSwallowed() {
        BusinessException boom = new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        when(decisionTreeService.decisionTree(9L)).thenThrow(boom);

        BusinessException thrown = assertThrows(BusinessException.class,
                () -> controller.decisionTree(9L), "controller 不得吞业务异常");

        assertSame(boom, thrown, "向上抛同异常实例");
        assertEquals(ErrorCode.ROUTE_NOT_FOUND, thrown.getErrorCode());
        assertEquals(ErrorCode.ROUTE_NOT_FOUND.code(), thrown.getCode(), "码值 10601");
    }

    // ==================== C3 注解静态断言 ====================

    /** C3：类上有 @RequestMapping("/v1/v2/routes") 与 @RequiresToken("BEARER")，
     *  decisionTree 方法是 @GetMapping 且路径含 "{id}/decision-tree"（反射静态读取，不起容器）。 */
    @Test
    void classAndMethodAnnotationsMatchContract() throws Exception {
        RequestMapping classMapping = V2RouteController.class.getAnnotation(RequestMapping.class);
        assertNotNull(classMapping, "类上必须有 @RequestMapping");
        assertTrue(declaredPaths(classMapping.value(), classMapping.path())
                        .anyMatch("/v1/v2/routes"::equals),
                "类级路径必须是 /v1/v2/routes（S7 与 S11 共用的 v2 命名空间）");

        RequiresToken requiresToken = V2RouteController.class.getAnnotation(RequiresToken.class);
        assertNotNull(requiresToken, "类上必须有 @RequiresToken（framework4j-accesstoken）");
        assertEquals("BEARER", requiresToken.value(), "token 业务类型必须是 BEARER");

        Method method = V2RouteController.class.getMethod("decisionTree", Long.class);
        assertEquals(ApiResponse.class, method.getReturnType(), "方法返回 ApiResponse<Map<String,Object>> 信封");

        GetMapping getMapping = method.getAnnotation(GetMapping.class);
        assertNotNull(getMapping, "decisionTree 必须是 @GetMapping");
        assertTrue(declaredPaths(getMapping.value(), getMapping.path())
                        .anyMatch(p -> p.contains("{id}/decision-tree")),
                "方法路径必须含 {id}/decision-tree");
    }

    /** 聚合注解 value/path 两个互为 @AliasFor 的属性（裸反射不合成别名，两者并集才是完整路径集）。 */
    private static Stream<String> declaredPaths(String[] value, String[] path) {
        return Stream.concat(
                Arrays.stream(value == null ? new String[0] : value),
                Arrays.stream(path == null ? new String[0] : path));
    }
}
