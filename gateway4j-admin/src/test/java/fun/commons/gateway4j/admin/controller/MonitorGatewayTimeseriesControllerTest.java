package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.gateway4j.admin.service.MonitorTimeseriesService;
import fun.commons.gateway4j.admin.service.RouteService;
import fun.commons.gateway4j.admin.service.RouteSimulateService;
import fun.commons.gateway4j.admin.service.RouteTrafficSummaryService;
import fun.commons.gateway4j.admin.service.UpstreamHealthProbe;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * P4b-2a 网关级聚合时序端点 —— Controller 层直调测试
 * （MonitorControllerTest 的直调组织：直接 new MonitorController 注入 mock 依赖）。
 *
 * <p><b>测试先行</b>：{@code gatewayTimeseries} 方法尚未实现时本文件使 admin 测试
 * 编译失败 —— 预期 RED，C-agent 按本文件实现后由 R-agent 跑绿。</p>
 *
 * <p><b>期望端点形态（契约原文钉死，docs/ui-v2/实施契约.md §4.5 P4 表 P4b-2a）</b>：
 * <pre>
 * &#64;GetMapping("/gateway/timeseries")   // 挂在既有 MonitorController（类级 /v1/monitor）
 * public ApiResponse&lt;Map&lt;String, Object&gt;&gt; gatewayTimeseries(
 *         &#64;RequestParam(name = "time_range", defaultValue = "1h") String timeRange,
 *         &#64;RequestParam(name = "granularity", defaultValue = "1m") String granularity) {
 *     return ApiResponse.success(timeseriesService.gatewayTimeseries(timeRange, granularity));
 * }
 * </pre>
 * 要点：完整路径 GET /v1/monitor/gateway/timeseries；参数绑定名按契约原文
 * {@code time_range}/{@code granularity}（显式 name，缺省 1h/1m 由 defaultValue 补）；
 * 返回 ApiResponse.success 信封（区别于旧 /timeseries
 * 的裸 Map）；类级 {@code @RequiresToken("BEARER")} 沿用 MonitorController 既有注解。
 * Service 层语义见 {@code MonitorGatewayTimeseriesServiceTest}。</p>
 */
@ExtendWith(MockitoExtension.class)
class MonitorGatewayTimeseriesControllerTest {

    @Mock private RouteService routeService;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private MonitorTimeseriesService timeseriesService;
    @Mock private RouteSimulateService routeSimulateService;
    @Mock private RouteTrafficSummaryService trafficSummaryService;
    @Mock private UpstreamHealthProbe upstreamHealthProbe;

    private MonitorController controller;

    @BeforeEach
    void setUp() {
        controller = new MonitorController(routeService, conditionMapper, timeseriesService,
                routeSimulateService, trafficSummaryService, upstreamHealthProbe);
    }

    /** 显式 24h/5m 透传 service → ApiResponse.success 包装（code=0 信封、data 原样）。 */
    @Test
    void gatewayTimeseriesDelegatesToServiceAndWrapsApiResponse() {
        Map<String, Object> serviceResult = new LinkedHashMap<>();
        serviceResult.put("source", "prometheus");
        serviceResult.put("data_points", List.of(Map.of("total_requests", 1L)));
        when(timeseriesService.gatewayTimeseries("24h", "5m")).thenReturn(serviceResult);

        ApiResponse<Map<String, Object>> response = controller.gatewayTimeseries("24h", "5m");

        assertEquals(ApiCode.SUCCESS.getCode(), response.getCode(), "须走 ApiResponse.success 信封");
        assertSame(serviceResult, response.getData(), "data 须原样透传 service 结果");
        verify(timeseriesService).gatewayTimeseries("24h", "5m");
    }

    /** 默认参数路径（缺省 time_range→1h、granularity→1m）：显式传默认值时同样透传 service。 */
    @Test
    void gatewayTimeseriesDefaultParamsPassThrough() {
        Map<String, Object> serviceResult = Map.of("source", "snapshot");
        when(timeseriesService.gatewayTimeseries("1h", "1m")).thenReturn(serviceResult);

        ApiResponse<Map<String, Object>> response = controller.gatewayTimeseries("1h", "1m");

        assertEquals("snapshot", response.getData().get("source"));
        verify(timeseriesService).gatewayTimeseries("1h", "1m");
    }

    /** 注解静态断言：GET /v1/monitor/gateway/timeseries、@RequiresToken("BEARER")、
     * 参数名 time_range/granularity + defaultValue 1h/1m、返回 ApiResponse 信封。 */
    @Test
    void endpointAndSecurityAnnotationsMatchContract() throws Exception {
        RequestMapping classMapping = MonitorController.class.getAnnotation(RequestMapping.class);
        assertNotNull(classMapping, "MonitorController 类上必须有 @RequestMapping");
        assertTrue(declaredPaths(classMapping.value(), classMapping.path())
                        .anyMatch("/v1/monitor"::equals),
                "类级路径必须是 /v1/monitor（完整端点 = /v1/monitor/gateway/timeseries）");

        RequiresToken requiresToken = MonitorController.class.getAnnotation(RequiresToken.class);
        assertNotNull(requiresToken, "类上必须有 @RequiresToken（framework4j-accesstoken）");
        assertEquals("BEARER", requiresToken.value(), "token 业务类型必须是 BEARER");

        Method method = MonitorController.class.getMethod("gatewayTimeseries", String.class, String.class);
        assertEquals(ApiResponse.class, method.getReturnType(),
                "须返回 ApiResponse 信封（区别于旧 /timeseries 的裸 Map）");

        GetMapping getMapping = method.getAnnotation(GetMapping.class);
        assertNotNull(getMapping, "方法必须有 @GetMapping");
        assertTrue(declaredPaths(getMapping.value(), getMapping.path())
                        .anyMatch("/gateway/timeseries"::equals),
                "方法路径必须是 /gateway/timeseries（契约原文）");

        Parameter[] parameters = method.getParameters();
        assertEquals(2, parameters.length, "入参只有 time_range 与 granularity");
        RequestParam timeRange = parameters[0].getAnnotation(RequestParam.class);
        assertNotNull(timeRange, "timeRange 必须是 @RequestParam");
        assertEquals("time_range", requestParamName(timeRange), "参数绑定名按契约原文 time_range");
        assertEquals("1h", timeRange.defaultValue(), "缺省 time_range → 1h");
        RequestParam granularity = parameters[1].getAnnotation(RequestParam.class);
        assertNotNull(granularity, "granularity 必须是 @RequestParam");
        assertEquals("granularity", requestParamName(granularity), "参数绑定名 granularity");
        assertEquals("1m", granularity.defaultValue(), "缺省 granularity → 1m");
    }

    /** 聚合注解 value/path 两个互为 @AliasFor 的属性（裸反射不合成别名，取并集）。 */
    private static Stream<String> declaredPaths(String[] value, String[] path) {
        return Stream.concat(
                Arrays.stream(value == null ? new String[0] : value),
                Arrays.stream(path == null ? new String[0] : path));
    }

    /** @RequestParam 的绑定名：value 与 name 互为别名，取非空者。 */
    private static String requestParamName(RequestParam annotation) {
        return !annotation.value().isEmpty() ? annotation.value() : annotation.name();
    }
}
