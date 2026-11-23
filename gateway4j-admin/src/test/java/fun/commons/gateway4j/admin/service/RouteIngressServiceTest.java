package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import fun.commons.gateway4j.admin.controller.RouteController;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.mapper.RoutePredicateMapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.common.model.RoutePredicate;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * S12-3 / S12-6：管理面批量 Ingress 建路由服务单测（契约 docs/ui-v2/实施契约.md §10）。
 *
 * <p>契约要点（实现须与本文件一致）：</p>
 * <ul>
 *   <li>一次请求把 K8s Ingress 的 rules[] 落成 N 条普通 BACKEND 路由（route_name =
 *       {@code <name>_<序号>}，序号从 1 起全局连续），每条路由附 host 谓词行
 *       （{@code Host={host}}）+ 顶层 predicates[] 各插一份 + plugins[] 绑定行。</li>
 *   <li>pathType 三值：PREFIX → {@code /api} 补成 {@code /api/**}（已带 {@code /**}
 *       或 {@code /*} 则原样）；EXACT / IMPLEMENTATION_SPECIFIC 原样。</li>
 *   <li><b>S12-6：path 级 {@code backend{service,port}} 合并为单字段 {@code uri}</b>
 *       （SCG {@code RouteDefinition.uri} 同名同义 = 完整上游地址 {@code scheme://host[:port]}）。
 *       uri 原样落 {@code gw_route.upstream_url}（不再由服务端合成）；
 *       uri 空 / 缺 scheme / 含空白 → 整单拒收，错误文案点明格式。</li>
 *   <li>整个请求一个事务：中途失败全量回滚，不留半成品路由。</li>
 *   <li>校验前置：rules 非空、path 必填、uri 必填且合法、plugin_id 必须真实存在
 *       （查 gw_plugin）→ 否则整单拒收。</li>
 * </ul>
 *
 * <p>写法先例：RouteServiceTest（setBaseMapper 反射注入 + TableInfoHelper 注册）、
 * RouteVersionServiceTest（MapperBuilderAssistant 注册 TableInfo）。</p>
 */
class RouteIngressServiceTest {

    @Mock private RouteMapper routeMapper;
    @Mock private RoutePredicateMapper predicateMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private PluginMapper pluginMapper;
    @Mock private ApplicationEventPublisher eventPublisher;

    private RouteIngressService service;
    private AtomicLong idSeq;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        initTableInfo(Route.class);
        initTableInfo(RoutePredicate.class);
        initTableInfo(RoutePluginBinding.class);
        initTableInfo(Plugin.class);
        service = new RouteIngressService(routeMapper, predicateMapper, bindingMapper,
                pluginMapper, eventPublisher);
        idSeq = new AtomicLong(100L);
        when(routeMapper.insert(any(Route.class))).thenAnswer(inv -> {
            Route r = inv.getArgument(0);
            r.setId(idSeq.incrementAndGet());
            return 1;
        });
        when(predicateMapper.insert(any(RoutePredicate.class))).thenReturn(1);
        when(bindingMapper.insert(any(RoutePluginBinding.class))).thenReturn(1);
        when(routeMapper.selectList(any())).thenReturn(List.of());
        when(pluginMapper.selectOne(any())).thenReturn(plugin(7L, "dingtalk"));
    }

    private void initTableInfo(Class<?> entity) {
        if (TableInfoHelper.getTableInfo(entity) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    private Plugin plugin(Long id, String code) {
        return Plugin.builder().id(id).pluginId(code).pluginName(code).status("ENABLED").build();
    }

    /** 一条 path（uri = 完整上游地址，SCG RouteDefinition.uri 同名同义）。 */
    private RouteController.IngressPathRequest path(String p, String type, String uri) {
        return new RouteController.IngressPathRequest(p, type, uri);
    }

    private RouteController.IngressRuleRequest rule(String host, RouteController.IngressPathRequest... paths) {
        return new RouteController.IngressRuleRequest(host, List.of(paths));
    }

    private RouteController.IngressCreateRequest request(String name,
                                                         List<RouteController.IngressRuleRequest> rules) {
        return new RouteController.IngressCreateRequest(name, "default", "", "",
                rules, List.of(), List.of());
    }

    // ==================== 1. 一 rule 一 path ====================

    @Test
    void oneRuleOnePathCreatesBackendRouteWithHostPredicateAndBinding() {
        RouteController.IngressCreateRequest req = new RouteController.IngressCreateRequest(
                "api_gateway", "default", "入口", "prod",
                List.of(rule("api.example.com", path("/api", "PREFIX", "http://user-service:8080"))),
                List.of(new RouteController.IngressPluginRequest("dingtalk", "{}")),
                List.of());

        RouteController.IngressCreateResult result = service.createIngress(req);

        assertNotNull(result);
        assertEquals(1, result.created().size());
        RouteController.IngressCreatedRoute created = result.created().get(0);
        assertEquals("api_gateway_1", created.routeName());
        assertEquals("/api/**", created.path());
        assertEquals("api.example.com", created.host());
        assertNotNull(created.routeId());

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        Route route = routeCap.getValue();
        assertEquals("api_gateway_1", route.getRouteName());
        assertEquals("BACKEND", route.getRouteType());
        assertEquals("/api/**", route.getPath());
        assertEquals("http://user-service:8080", route.getUpstreamUrl());
        assertEquals("default", route.getEnvironment());
        assertEquals(1, route.getSortOrder());

        ArgumentCaptor<RoutePredicate> predCap = ArgumentCaptor.forClass(RoutePredicate.class);
        verify(predicateMapper).insert(predCap.capture());
        assertEquals("Host=api.example.com", predCap.getValue().getDefinition());
        assertEquals(route.getId(), predCap.getValue().getRouteId());

        ArgumentCaptor<RoutePluginBinding> bindCap = ArgumentCaptor.forClass(RoutePluginBinding.class);
        verify(bindingMapper).insert(bindCap.capture());
        assertEquals(7L, bindCap.getValue().getPluginId());
        assertEquals(route.getId(), bindCap.getValue().getRouteId());
        assertEquals("{}", bindCap.getValue().getBindingConfig());
        assertEquals(0, bindCap.getValue().getSortOrder());
    }

    // ==================== 2. 一 rule 多 path → 序号递增 ====================

    @Test
    void multiplePathsProduceIncrementingRouteNames() {
        RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                rule("api.example.com",
                        path("/a", "PREFIX", "http://svc-a:8080"),
                        path("/b", "PREFIX", "http://svc-b:8080"),
                        path("/c", "EXACT", "http://svc-c:8080"))));

        RouteController.IngressCreateResult result = service.createIngress(req);

        assertEquals(3, result.created().size());
        assertEquals("api_gateway_1", result.created().get(0).routeName());
        assertEquals("api_gateway_2", result.created().get(1).routeName());
        assertEquals("api_gateway_3", result.created().get(2).routeName());

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper, times(3)).insert(routeCap.capture());
        List<Route> routes = routeCap.getAllValues();
        assertEquals("/a/**", routes.get(0).getPath());
        assertEquals("/b/**", routes.get(1).getPath());
        assertEquals("/c", routes.get(2).getPath());
        assertEquals(1, routes.get(0).getSortOrder());
        assertEquals(2, routes.get(1).getSortOrder());
        assertEquals(3, routes.get(2).getSortOrder());
    }

    // ==================== 3. pathType 三值映射 ====================

    @Test
    void pathTypeMappingPrefixExactImplementationSpecific() {
        RouteController.IngressCreateRequest req = request("map_demo", List.of(
                rule("h.example.com",
                        path("/api", "PREFIX", "http://svc:80"),
                        path("/api/**", "PREFIX", "http://svc:80"),
                        path("/api/*", "PREFIX", "http://svc:80"),
                        path("/api/v1", "EXACT", "http://svc:80"),
                        path("/api/{id:[0-9]+}", "IMPLEMENTATION_SPECIFIC", "http://svc:80"))));

        service.createIngress(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper, times(5)).insert(routeCap.capture());
        List<Route> routes = routeCap.getAllValues();
        assertEquals("/api/**", routes.get(0).getPath());
        assertEquals("/api/**", routes.get(1).getPath());
        assertEquals("/api/*", routes.get(2).getPath());
        assertEquals("/api/v1", routes.get(3).getPath());
        assertEquals("/api/{id:[0-9]+}", routes.get(4).getPath());
    }

    // ==================== 4. upstream_url 直落（uri 原样，不再合成） ====================

    @Test
    void upstreamUrlStoredVerbatimFromUri() {
        RouteController.IngressCreateRequest req = request("up_demo", List.of(
                rule("h.example.com",
                        path("/a", "PREFIX", "http://user-service:8080"),
                        path("/b", "PREFIX", "https://user-service"),
                        path("/c", "PREFIX", "http://user-service:8080"))));

        service.createIngress(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper, times(3)).insert(routeCap.capture());
        List<Route> routes = routeCap.getAllValues();
        assertEquals("http://user-service:8080", routes.get(0).getUpstreamUrl());
        assertEquals("https://user-service", routes.get(1).getUpstreamUrl());
        assertEquals("http://user-service:8080", routes.get(2).getUpstreamUrl());
    }

    /**
     * S12-6 新增：uri 的 https 形态与带端口形态各自原样落 upstream_url
     * （服务端不再补 scheme、不再拼端口 —— 单一真相源 = 用户填的 uri）。
     */
    @Test
    void httpsAndPortUriVariantsStoredVerbatim() {
        RouteController.IngressCreateRequest req = request("uri_demo", List.of(
                rule("h.example.com",
                        path("/https", "PREFIX", "https://user-service"),
                        path("/port", "PREFIX", "http://user-service:8080"),
                        path("/https-port", "PREFIX", "https://user-service:8443"))));

        service.createIngress(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper, times(3)).insert(routeCap.capture());
        List<Route> routes = routeCap.getAllValues();
        assertEquals("https://user-service", routes.get(0).getUpstreamUrl());
        assertEquals("http://user-service:8080", routes.get(1).getUpstreamUrl());
        assertEquals("https://user-service:8443", routes.get(2).getUpstreamUrl());
    }

    /** uri 前后空白被 trim 后落库（首尾空白不算非法）。 */
    @Test
    void uriIsTrimmedBeforeStored() {
        RouteController.IngressCreateRequest req = request("trim_demo", List.of(
                rule("h.example.com", path("/a", "PREFIX", "  http://user-service:8080  "))));

        service.createIngress(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        assertEquals("http://user-service:8080", routeCap.getValue().getUpstreamUrl());
    }

    // ==================== 5. 空 host 不插谓词行；顶层 predicates 每路由一份 ====================

    @Test
    void emptyHostSkipsHostPredicateButTopLevelPredicatesAppliedToEveryRoute() {
        RouteController.IngressCreateRequest req = new RouteController.IngressCreateRequest(
                "pred_demo", "default", "", "",
                List.of(rule("", path("/a", "PREFIX", "http://svc:80"),
                        path("/b", "PREFIX", "http://svc:80"))),
                List.of(),
                List.of("Method=GET,POST"));

        service.createIngress(req);

        ArgumentCaptor<RoutePredicate> predCap = ArgumentCaptor.forClass(RoutePredicate.class);
        verify(predicateMapper, times(2)).insert(predCap.capture());
        List<RoutePredicate> predicates = predCap.getAllValues();
        assertEquals("Method=GET,POST", predicates.get(0).getDefinition());
        assertEquals("Method=GET,POST", predicates.get(1).getDefinition());
        assertNotEquals(predicates.get(0).getRouteId(), predicates.get(1).getRouteId());
        assertFalse(predicates.stream().anyMatch(p -> p.getDefinition().startsWith("Host=")));
    }

    @Test
    void topLevelPredicatesAndHostPredicateBothInsertedPerRoute() {
        RouteController.IngressCreateRequest req = new RouteController.IngressCreateRequest(
                "both_demo", "default", "", "",
                List.of(rule("api.example.com", path("/a", "PREFIX", "http://svc:80"))),
                List.of(),
                List.of("Method=GET,POST", "Cookie=session"));

        service.createIngress(req);

        ArgumentCaptor<RoutePredicate> predCap = ArgumentCaptor.forClass(RoutePredicate.class);
        verify(predicateMapper, times(3)).insert(predCap.capture());
        List<RoutePredicate> predicates = predCap.getAllValues();
        assertEquals("Host=api.example.com", predicates.get(0).getDefinition());
        assertEquals("Method=GET,POST", predicates.get(1).getDefinition());
        assertEquals("Cookie=session", predicates.get(2).getDefinition());
    }

    // ==================== 6. 事务回滚：中途失败异常上抛，不吞 ====================

    @Test
    void failureOnSecondRoutePropagatesAndDoesNotSwallow() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(inv -> {
            Route r = inv.getArgument(0);
            if ("api_gateway_2".equals(r.getRouteName())) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "模拟第 2 条路由落库失败");
            }
            r.setId(idSeq.incrementAndGet());
            return 1;
        });

        RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                rule("api.example.com",
                        path("/a", "PREFIX", "http://svc:80"),
                        path("/b", "PREFIX", "http://svc:80"))));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createIngress(req));
        assertEquals(ErrorCode.CONFIG_SYNC_FAILED.code(), ex.getCode());
        // 第 2 条失败后不再继续插谓词/绑定行；真实回滚由 @Transactional 保证（单测无事务）
        verify(routeMapper, times(2)).insert(any(Route.class));
        verify(predicateMapper, times(1)).insert(any(RoutePredicate.class));
    }

    // ==================== 7. 名称冲突 ====================

    @Test
    void duplicateRouteNameRejected() {
        Route existing = Route.builder().id(1L).routeName("api_gateway_1")
                .routeType("BACKEND").environment("default").build();
        when(routeMapper.selectList(any())).thenReturn(List.of(existing));

        RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                rule("api.example.com", path("/a", "PREFIX", "http://svc:80"))));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createIngress(req));
        assertEquals(ErrorCode.ROUTE_NAME_CONFLICT.code(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    // ==================== 8. 非法输入 ====================

    @Test
    void emptyRulesRejected() {
        RouteController.IngressCreateRequest req = request("api_gateway", List.of());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.createIngress(req));
        assertEquals(ErrorCode.CONFIG_SYNC_FAILED.code(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    @Test
    void emptyPathRejected() {
        RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                rule("api.example.com", path("", "PREFIX", "http://svc:80"))));
        assertThrows(BusinessException.class, () -> service.createIngress(req));
        verify(routeMapper, never()).insert(any(Route.class));
    }

    @Test
    void unknownPluginRejected() {
        when(pluginMapper.selectOne(any())).thenReturn(null);
        RouteController.IngressCreateRequest req = new RouteController.IngressCreateRequest(
                "api_gateway", "default", "", "",
                List.of(rule("api.example.com", path("/a", "PREFIX", "http://svc:80"))),
                List.of(new RouteController.IngressPluginRequest("not-exist", "{}")),
                List.of());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createIngress(req));
        assertEquals(ErrorCode.PLUGIN_NOT_FOUND.code(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    @Test
    void illegalBaseNameRejected() {
        RouteController.IngressCreateRequest req = request("bad-name!", List.of(
                rule("api.example.com", path("/a", "PREFIX", "http://svc:80"))));
        assertThrows(BusinessException.class, () -> service.createIngress(req));
        verify(routeMapper, never()).insert(any(Route.class));
    }

    @Test
    void illegalEnvironmentRejected() {
        RouteController.IngressCreateRequest req = new RouteController.IngressCreateRequest(
                "api_gateway", "BAD ENV", "", "",
                List.of(rule("api.example.com", path("/a", "PREFIX", "http://svc:80"))),
                List.of(), List.of());
        assertThrows(BusinessException.class, () -> service.createIngress(req));
        verify(routeMapper, never()).insert(any(Route.class));
    }

    // ==================== 9. S12-6：uri 非法 → 拒收且文案点明格式 ====================

    /** 空 uri → 拒收，文案点明「上游地址不能为空」+ 格式示例。 */
    @Test
    void emptyUriRejected() {
        RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                rule("api.example.com", path("/a", "PREFIX", ""))));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.createIngress(req));
        assertEquals(ErrorCode.CONFIG_SYNC_FAILED.code(), ex.getCode());
        assertTrue(ex.getMessage().contains("上游地址"), ex.getMessage());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /**
     * S12-6 新增：uri 缺 scheme / 含空白 / 仅 host 三种非法形态一律拒收，
     * 且错误文案点明「http:// 或 https:// 开头的完整上游地址」与格式示例。
     */
    @Test
    void invalidUriRejectedWithFormatHint() {
        List<String> invalidUris = List.of(
                "user-service:8080",        // 缺 scheme
                "http://user service:8080", // 含空白
                "ftp://user-service:8080",  // 非 http/https
                "user-service"              // 裸 host
        );
        for (String bad : invalidUris) {
            RouteController.IngressCreateRequest req = request("api_gateway", List.of(
                    rule("api.example.com", path("/a", "PREFIX", bad))));
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.createIngress(req), "非法 uri 必须拒收：" + bad);
            assertEquals(ErrorCode.CONFIG_SYNC_FAILED.code(), ex.getCode());
            assertTrue(ex.getMessage().contains("http://"), ex.getMessage());
            assertTrue(ex.getMessage().contains("https://"), ex.getMessage());
            assertTrue(ex.getMessage().contains("http://user-service:8080"),
                    "错误文案须给出格式示例：" + ex.getMessage());
        }
        verify(routeMapper, never()).insert(any(Route.class));
    }

    // ==================== 10. 线格式契约：前端实际 payload → DTO 绑定 ====================

    /**
     * 前端（src/api/routes.ts 的 IngressRoutePayload）实际发出的 JSON 必须能被后端
     * DTO 绑定：全局 Jackson 走 snake_case（framework4j-web WebConfig），而
     * {@code pathType} 是驼峰 —— 靠 DTO 上的显式 @JsonProperty 钉死。
     */
    @Test
    void frontendPayloadBindsToRequestRecord() throws Exception {
        String json = """
                {"name":"api_gateway","environment":"default","remark":"","tags":"",
                 "rules":[{"host":"api.example.com","paths":[
                     {"path":"/api/**","pathType":"PREFIX","uri":"http://user-service:8080"}]}],
                 "plugins":[{"plugin_id":"dingtalk","binding_config":"{}"}],
                 "predicates":["Method=GET,POST"]}
                """;
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

        RouteController.IngressCreateRequest request =
                mapper.readValue(json, RouteController.IngressCreateRequest.class);

        assertEquals("api_gateway", request.name());
        assertEquals("default", request.environment());
        assertEquals(1, request.rules().size());
        RouteController.IngressRuleRequest rule = request.rules().get(0);
        assertEquals("api.example.com", rule.host());
        assertEquals(1, rule.paths().size());
        RouteController.IngressPathRequest path = rule.paths().get(0);
        assertEquals("/api/**", path.path());
        assertEquals("PREFIX", path.pathType());
        assertEquals("http://user-service:8080", path.uri());
        assertEquals("dingtalk", request.plugins().get(0).pluginId());
        assertEquals("{}", request.plugins().get(0).bindingConfig());
        assertEquals(List.of("Method=GET,POST"), request.predicates());
    }

    /** 未知字段（前端多带的 upstream_url 等）不得炸 —— DTO 显式忽略未知属性。 */
    @Test
    void unknownFieldsAreIgnored() throws Exception {
        String json = """
                {"name":"api_gateway","rules":[{"host":"","paths":[
                     {"path":"/api/**","pathType":"PREFIX","upstream_url":"http://x:80",
                      "uri":"http://user-service:8080"}]}]}
                """;
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        RouteController.IngressCreateRequest request =
                mapper.readValue(json, RouteController.IngressCreateRequest.class);
        assertEquals("/api/**", request.rules().get(0).paths().get(0).path());
        assertEquals("http://user-service:8080", request.rules().get(0).paths().get(0).uri());
    }

    /** 响应 data：snake_case 键 + route_id 序列化为字符串（对齐前端 IngressCreatedRoute）。 */
    @Test
    void createdResultSerializesWithSnakeCaseKeys() throws Exception {
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        SimpleModule longToString = new SimpleModule();
        longToString.addSerializer(Long.class, ToStringSerializer.instance);
        mapper.registerModule(longToString);

        String json = mapper.writeValueAsString(new RouteController.IngressCreateResult(
                List.of(new RouteController.IngressCreatedRoute(
                        123L, "api_gateway_1", "/api/**", "api.example.com"))));

        assertTrue(json.contains("\"route_id\":\"123\""), json);
        assertTrue(json.contains("\"route_name\":\"api_gateway_1\""), json);
        assertTrue(json.contains("\"created\""), json);
    }
}
