package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import fun.commons.gateway4j.admin.controller.RouteController;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteFilterMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePredicateMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteFilter;
import fun.commons.gateway4j.common.model.RoutePredicate;
import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiException;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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
 * S12-7b：管理面批量建路由服务单测（SCG {@code RouteDefinition} 1:1 形态，
 * 契约 docs/API_CONTRACT.md §19.1 / docs/ui-v2/实施契约.md §10.1）。
 *
 * <p>契约要点（实现须与本文件一致）：</p>
 * <ul>
 *   <li>一条路由 = 一条 SCG 路由定义：{@code name} 原样落 {@code route_name}
 *       （<b>不合成、不加序号</b>）；{@code uri} 原样落 {@code upstream_url}；
 *       {@code order} 落 {@code sort_order}（缺省 0）；{@code metadata} 序列化为
 *       JSON 字符串落 {@code Route.metadata}（缺省 {@code {}}）；
 *       {@code environment/remark/tags} 同既有创建口径（environment 缺省 default）。</li>
 *   <li><b>Path= 谓词抽取</b>：{@code predicates[]} 中的 {@code Path=<pattern>} 被
 *       抽出落 {@code gw_route.path}，<b>不另落</b> {@code gw_route_predicate} 行
 *       （引擎注册层由 path 生成唯一 Path 谓词，重复落行会双评）；一条路由
 *       <b>最多一个</b> {@code Path=}（多个 → 10100 拒收）；{@code Path=/a,/b}
 *       多 pattern 形态不支持（→ 10100）；无 {@code Path=} 允许（path 落 null）。</li>
 *   <li>其余谓词逐条落 {@code gw_route_predicate}（sort_order 从 0 递增）；
 *       {@code filters[]} 逐条落 {@code gw_route_filter}（sort_order = 数组下标）。</li>
 *   <li>定义串<b>只做结构校验</b>（非空、长度 ≤500 与 DDL 一致）：合法性（未知
 *       filter 名等）不在写入侧校验——由引擎装配期语义兜底（S12-7a）。</li>
 *   <li>{@code gw_route.route_type} 一律 BACKEND；{@code status} 一律 DRAFT
 *       （需另行 publish 才在网关生效，与 §4.2 一致）。</li>
 *   <li>重名（同环境，含批内重复与已入库）→ 10609 整单拒收；整个请求一个事务。</li>
 * </ul>
 *
 * <p>写法先例：RouteServiceTest（setBaseMapper 反射注入 + TableInfoHelper 注册）、
 * 原 RouteIngressServiceTest（S12-3，本文件为其 SCG 1:1 形态继任者）。</p>
 */
class RouteBatchServiceTest {

    @Mock private RouteMapper routeMapper;
    @Mock private RoutePredicateMapper predicateMapper;
    @Mock private RouteFilterMapper filterMapper;
    @Mock private ApplicationEventPublisher eventPublisher;

    private RouteBatchService service;
    private AtomicLong idSeq;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        initTableInfo(Route.class);
        initTableInfo(RoutePredicate.class);
        initTableInfo(RouteFilter.class);
        service = new RouteBatchService(routeMapper, predicateMapper, filterMapper, eventPublisher);
        idSeq = new AtomicLong(100L);
        when(routeMapper.insert(any(Route.class))).thenAnswer(inv -> {
            Route r = inv.getArgument(0);
            r.setId(idSeq.incrementAndGet());
            return 1;
        });
        when(predicateMapper.insert(any(RoutePredicate.class))).thenReturn(1);
        when(filterMapper.insert(any(RouteFilter.class))).thenReturn(1);
        when(routeMapper.selectList(any())).thenReturn(List.of());
    }

    private void initTableInfo(Class<?> entity) {
        if (TableInfoHelper.getTableInfo(entity) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    /** 一条路由请求（SCG RouteDefinition 1:1 线格式）。 */
    private RouteController.BatchRouteRequest route(String name, String uri,
                                                    List<String> predicates, List<String> filters) {
        return new RouteController.BatchRouteRequest(name, uri, predicates, filters,
                null, null, null, null, null);
    }

    private RouteController.BatchCreateRequest batch(RouteController.BatchRouteRequest... routes) {
        return new RouteController.BatchCreateRequest(List.of(routes));
    }

    // ==================== 1. SCG 1:1 映射 ====================

    /**
     * 单路由全字段：name 原样（不加序号）、uri→upstream_url、order→sort_order、
     * metadata→JSON 字符串、route_type=BACKEND、status=DRAFT（需另行 publish）。
     */
    @Test
    void oneRouteScgDefinitionMappedVerbatim() throws Exception {
        ObjectMapper om = new ObjectMapper();
        JsonNode metadata = om.readTree("{\"team\":\"core\",\"tier\":2}");

        RouteController.BatchCreateRequest req = new RouteController.BatchCreateRequest(
                List.of(new RouteController.BatchRouteRequest(
                        "api_gateway_1", "http://user-service:8080",
                        List.of("Host=api.example.com", "Method=GET,POST"),
                        List.of("AddRequestHeader=X-Foo, bar", "StripPrefix=1"),
                        10, metadata, "staging", "入口", "prod")));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertNotNull(result);
        assertEquals(1, result.created().size());
        RouteController.BatchCreatedRoute created = result.created().get(0);
        assertEquals("api_gateway_1", created.routeName());
        assertEquals("http://user-service:8080", created.uri());
        // 无 Path= 谓词 → path 落 null（SCG 原生语义：路由不限路径）
        assertNull(created.path());
        assertEquals(2, created.predicatesCount());
        assertEquals(2, created.filtersCount());

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        Route route = routeCap.getValue();
        assertEquals("api_gateway_1", route.getRouteName()); // 原样，无 _1 以外合成
        assertEquals("BACKEND", route.getRouteType());
        assertNull(route.getPath());
        assertEquals("http://user-service:8080", route.getUpstreamUrl());
        assertEquals("DRAFT", route.getStatus()); // 一律 DRAFT，另行 publish
        assertEquals(10, route.getSortOrder());
        assertEquals("staging", route.getEnvironment());
        assertEquals("入口", route.getRemark());
        assertEquals("prod", route.getTags());
        assertEquals("{\"team\":\"core\",\"tier\":2}", route.getMetadata());
        assertNotNull(route.getId());
    }

    /** 缺省值：order→0、metadata→{}、environment→default、tags→""。 */
    @Test
    void defaultsAppliedWhenOptionalFieldsMissing() {
        RouteController.BatchCreateRequest req = batch(
                route("minimal", "https://svc.example.com", List.of("Path=/api/**"), List.of()));

        service.createBatch(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        Route route = routeCap.getValue();
        assertEquals(0, route.getSortOrder());
        assertEquals("{}", route.getMetadata());
        assertEquals("default", route.getEnvironment());
        assertEquals("", route.getTags());
    }

    // ==================== 2. Path= 谓词抽取（契约 §19.1.3/§19.1.4） ====================

    /** Path= 抽取落 gw_route.path，不落谓词行；其余谓词 sort_order 从 0 连续递增。 */
    @Test
    void pathPredicateExtractedToPathColumnNotPredicateRow() {
        RouteController.BatchCreateRequest req = batch(route("extract_demo",
                "http://svc:8080",
                List.of("Path=/api/**", "Host=api.example.com", "Method=GET"),
                List.of()));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertEquals("/api/**", result.created().get(0).path());
        assertEquals(2, result.created().get(0).predicatesCount()); // 不含被抽取的 Path=

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        assertEquals("/api/**", routeCap.getValue().getPath());

        ArgumentCaptor<RoutePredicate> predCap = ArgumentCaptor.forClass(RoutePredicate.class);
        verify(predicateMapper, times(2)).insert(predCap.capture());
        List<RoutePredicate> predicates = predCap.getAllValues();
        assertEquals("Host=api.example.com", predicates.get(0).getDefinition());
        assertEquals(0, predicates.get(0).getSortOrder());
        assertEquals("Method=GET", predicates.get(1).getDefinition());
        assertEquals(1, predicates.get(1).getSortOrder());
        assertFalse(predicates.stream().anyMatch(p -> p.getDefinition().startsWith("Path=")),
                "Path= 谓词不得另落 gw_route_predicate 行（引擎由 path 生成，重复落行会双评）");
    }

    /** 一条路由多个 Path= → 10100 整单拒收（gw_route.path 单值，无法承载）。 */
    @Test
    void multiplePathPredicatesRejectedWith10100() {
        RouteController.BatchCreateRequest req = batch(route("multi_path",
                "http://svc:8080",
                List.of("Path=/api/**", "Path=/other/**"),
                List.of()));

        ApiException ex = assertThrows(ApiException.class, () -> service.createBatch(req));
        assertEquals(ApiCode.PARAM_ERROR.getCode(), ex.getCode());
        assertTrue(ex.getMessage().contains("Path"), ex.getMessage());
        verify(routeMapper, never()).insert(any(Route.class));
        verify(predicateMapper, never()).insert(any(RoutePredicate.class));
    }

    /** Path=/a,/b 多 pattern 形态明确不支持（SCG GATHER_LIST vs gw_route.path 单值）→ 10100。 */
    @Test
    void multiPatternPathRejected() {
        RouteController.BatchCreateRequest req = batch(route("multi_pattern",
                "http://svc:8080",
                List.of("Path=/api,/other"),
                List.of()));

        ApiException ex = assertThrows(ApiException.class, () -> service.createBatch(req));
        assertEquals(ApiCode.PARAM_ERROR.getCode(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** 无 Path= 允许（SCG 原生语义），gw_route.path 落 null。 */
    @Test
    void noPathPredicateAllowedWithNullPath() {
        RouteController.BatchCreateRequest req = batch(route("no_path",
                "http://svc:8080",
                List.of("Host=api.example.com"),
                List.of()));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertNull(result.created().get(0).path());
        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper).insert(routeCap.capture());
        assertNull(routeCap.getValue().getPath());
    }

    /** Path= 值非法（不以 / 开头、含空白、空值）→ 10100（path 列既有校验口径）。 */
    @Test
    void illegalPathValueRejected() {
        List<String> badPaths = List.of("api/**", "/api /x", "");
        for (String bad : badPaths) {
            String definition = "Path=" + bad;
            RouteController.BatchCreateRequest req = batch(route("bad_path_" + bad.hashCode(),
                    "http://svc:8080", List.of(definition), List.of()));
            ApiException ex = assertThrows(ApiException.class, () -> service.createBatch(req),
                    "非法 Path 值必须拒收：" + definition);
            assertEquals(ApiCode.PARAM_ERROR.getCode(), ex.getCode());
        }
        verify(routeMapper, never()).insert(any(Route.class));
    }

    // ==================== 3. filters / predicates 结构校验（非语义） ====================

    /** filters 逐条落 gw_route_filter，sort_order = 数组下标；定义串原样（不解析语义）。 */
    @Test
    void filtersStoredWithArrayIndexSortOrder() {
        RouteController.BatchCreateRequest req = batch(route("filter_demo",
                "http://svc:8080",
                List.of("Path=/api/**"),
                List.of("AddRequestHeader=X-Foo, bar", "StripPrefix=1", "PreserveHostHeader")));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertEquals(3, result.created().get(0).filtersCount());
        ArgumentCaptor<RouteFilter> filterCap = ArgumentCaptor.forClass(RouteFilter.class);
        verify(filterMapper, times(3)).insert(filterCap.capture());
        List<RouteFilter> filters = filterCap.getAllValues();
        assertEquals("AddRequestHeader=X-Foo, bar", filters.get(0).getDefinition());
        assertEquals(0, filters.get(0).getSortOrder());
        assertEquals("StripPrefix=1", filters.get(1).getDefinition());
        assertEquals(1, filters.get(1).getSortOrder());
        assertEquals("PreserveHostHeader", filters.get(2).getDefinition());
        assertEquals(2, filters.get(2).getSortOrder());
    }

    /** 未知 filter 名不在写入侧校验（引擎装配期兜底）——任何非空定义串均放行落库。 */
    @Test
    void unknownFilterNameNotValidatedAtWriteSide() {
        RouteController.BatchCreateRequest req = batch(route("opaque_filter",
                "http://svc:8080",
                List.of("Path=/api/**"),
                List.of("Foo=bar", "=novalue")));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertEquals(2, result.created().get(0).filtersCount());
        verify(filterMapper, times(2)).insert(any(RouteFilter.class));
    }

    /** 定义串超长（>500，DDL VARCHAR(500)）→ 10100；谓词与 filter 同口径。 */
    @Test
    void overlongDefinitionRejected() {
        String tooLong = "Header=x," + "a".repeat(500); // > 500 chars
        RouteController.BatchCreateRequest reqFilter = batch(route("long_filter",
                "http://svc:8080", List.of("Path=/api/**"), List.of(tooLong)));
        ApiException exFilter = assertThrows(ApiException.class, () -> service.createBatch(reqFilter));
        assertEquals(ApiCode.PARAM_ERROR.getCode(), exFilter.getCode());

        RouteController.BatchCreateRequest reqPred = batch(route("long_pred",
                "http://svc:8080", List.of(tooLong), List.of()));
        ApiException exPred = assertThrows(ApiException.class, () -> service.createBatch(reqPred));
        assertEquals(ApiCode.PARAM_ERROR.getCode(), exPred.getCode());

        verify(routeMapper, never()).insert(any(Route.class));
    }

    // ==================== 4. metadata ====================

    /** metadata 为 null/缺省 → "{}"；为对象 → 紧凑 JSON 字符串原样落 Route.metadata。 */
    @Test
    void metadataNullOrObjectHandled() throws Exception {
        ObjectMapper om = new ObjectMapper();
        RouteController.BatchCreateRequest req = new RouteController.BatchCreateRequest(
                List.of(new RouteController.BatchRouteRequest(
                                "meta_obj", "http://svc:8080", List.of("Path=/a"), List.of(),
                                null, om.readTree("{\"k\":\"v\",\"n\":1}"), null, null, null),
                        new RouteController.BatchRouteRequest(
                                "meta_null", "http://svc:8080", List.of("Path=/b"), List.of(),
                                null, null, null, null, null)));

        service.createBatch(req);

        ArgumentCaptor<Route> routeCap = ArgumentCaptor.forClass(Route.class);
        verify(routeMapper, times(2)).insert(routeCap.capture());
        List<Route> routes = routeCap.getAllValues();
        assertEquals("{\"k\":\"v\",\"n\":1}", routes.get(0).getMetadata());
        assertEquals("{}", routes.get(1).getMetadata());
    }

    // ==================== 5. 重名冲突（10609） ====================

    /** 已入库同名（同环境）→ 10609 整单拒收、零落库。 */
    @Test
    void conflictingNameInDbRejected() {
        Route existing = Route.builder().id(1L).routeName("dup_route")
                .routeType("BACKEND").environment("default").build();
        when(routeMapper.selectList(any())).thenReturn(List.of(existing));

        RouteController.BatchCreateRequest req = batch(
                route("fresh_route", "http://svc:8080", List.of("Path=/a"), List.of()),
                route("dup_route", "http://svc:8080", List.of("Path=/b"), List.of()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createBatch(req));
        assertEquals(ErrorCode.ROUTE_NAME_CONFLICT.code(), ex.getCode());
        assertTrue(ex.getMessage().contains("dup_route"), ex.getMessage());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** 批内重复（同环境同名）→ 10609 整单拒收、零落库。 */
    @Test
    void duplicateNamesWithinBatchRejected() {
        RouteController.BatchCreateRequest req = batch(
                route("twin", "http://svc-a:8080", List.of("Path=/a"), List.of()),
                route("twin", "http://svc-b:8080", List.of("Path=/b"), List.of()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createBatch(req));
        assertEquals(ErrorCode.ROUTE_NAME_CONFLICT.code(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** 同名不同环境：批内允许（唯一索引为 (environment, route_name)）。 */
    @Test
    void sameNameInDifferentEnvironmentsAllowed() {
        RouteController.BatchCreateRequest req = new RouteController.BatchCreateRequest(
                List.of(new RouteController.BatchRouteRequest(
                                "shared_name", "http://svc-a:8080", List.of("Path=/a"), List.of(),
                                null, null, "default", null, null),
                        new RouteController.BatchRouteRequest(
                                "shared_name", "http://svc-b:8080", List.of("Path=/b"), List.of(),
                                null, null, "staging", null, null)));

        RouteController.BatchCreateResult result = service.createBatch(req);

        assertEquals(2, result.created().size());
        verify(routeMapper, times(2)).insert(any(Route.class));
    }

    // ==================== 6. 校验与事务 ====================

    /** 空 routes → 整单拒收（零命中拒收口径）。 */
    @Test
    void emptyRoutesRejected() {
        RouteController.BatchCreateRequest req = new RouteController.BatchCreateRequest(List.of());
        ApiException ex = assertThrows(ApiException.class, () -> service.createBatch(req));
        assertEquals(ApiCode.PARAM_ERROR.getCode(), ex.getCode());
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** uri 非法（缺 scheme/非 http(s)/含空白/裸 host）→ 10100，文案点明格式与示例。 */
    @Test
    void invalidUriRejectedWithFormatHint() {
        List<String> invalidUris = List.of(
                "user-service:8080",        // 缺 scheme
                "http://user service:8080", // 含空白
                "ftp://user-service:8080",  // 非 http/https
                "user-service"              // 裸 host
        );
        for (String bad : invalidUris) {
            RouteController.BatchCreateRequest req = batch(
                    route("uri_demo", bad, List.of("Path=/a"), List.of()));
            ApiException ex = assertThrows(ApiException.class, () -> service.createBatch(req),
                    "非法 uri 必须拒收：" + bad);
            assertEquals(ApiCode.PARAM_ERROR.getCode(), ex.getCode());
            assertTrue(ex.getMessage().contains("http://"), ex.getMessage());
            assertTrue(ex.getMessage().contains("https://"), ex.getMessage());
            assertTrue(ex.getMessage().contains("http://user-service:8080"),
                    "错误文案须给出格式示例：" + ex.getMessage());
        }
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** 非法 environment → 拒收（白名单口径同既有创建路由）。 */
    @Test
    void illegalEnvironmentRejected() {
        RouteController.BatchCreateRequest req = new RouteController.BatchCreateRequest(
                List.of(new RouteController.BatchRouteRequest(
                        "env_demo", "http://svc:8080", List.of("Path=/a"), List.of(),
                        null, null, "BAD ENV", null, null)));
        assertThrows(Exception.class, () -> service.createBatch(req));
        verify(routeMapper, never()).insert(any(Route.class));
    }

    /** 中途失败异常上抛不吞（真实回滚由 @Transactional 保证，单测无事务）。 */
    @Test
    void failureOnSecondRoutePropagatesAndDoesNotSwallow() {
        when(routeMapper.insert(any(Route.class))).thenAnswer(inv -> {
            Route r = inv.getArgument(0);
            if ("second".equals(r.getRouteName())) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "模拟第 2 条路由落库失败");
            }
            r.setId(idSeq.incrementAndGet());
            return 1;
        });

        RouteController.BatchCreateRequest req = batch(
                route("first", "http://svc:8080", List.of("Host=api.example.com"), List.of()),
                route("second", "http://svc:8080", List.of("Host=api.example.com"), List.of()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createBatch(req));
        assertEquals(ErrorCode.CONFIG_SYNC_FAILED.code(), ex.getCode());
        // 第 2 条失败后不再继续插谓词/filter 行；真实回滚由 @Transactional 保证（单测无事务）
        verify(routeMapper, times(2)).insert(any(Route.class));
        verify(predicateMapper, times(1)).insert(any(RoutePredicate.class));
        verify(filterMapper, never()).insert(any(RouteFilter.class));
    }

    /** 配置变更事件整批只发 1 条（AFTER_COMMIT 由监听器保证，此处只验证发布次数）。 */
    @Test
    void configChangeEventPublishedOncePerBatch() {
        RouteController.BatchCreateRequest req = batch(
                route("evt_a", "http://svc:8080", List.of("Path=/a"), List.of()),
                route("evt_b", "http://svc:8080", List.of("Path=/b"), List.of()),
                route("evt_c", "http://svc:8080", List.of("Path=/c"), List.of()));

        service.createBatch(req);

        verify(eventPublisher, times(1)).publishEvent(any(fun.commons.gateway4j.engine.config.event.ConfigChangeEvent.class));
    }

    /** 校验失败（如重名）时不发布配置变更事件（零副作用）。 */
    @Test
    void noEventPublishedOnValidationFailure() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                Route.builder().id(1L).routeName("dup_route").environment("default").build()));
        RouteController.BatchCreateRequest req = batch(
                route("dup_route", "http://svc:8080", List.of("Path=/a"), List.of()));

        assertThrows(BusinessException.class, () -> service.createBatch(req));
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    // ==================== 7. 线格式契约：请求/响应 DTO ====================

    /** 请求线格式：SCG RouteDefinition 字段名（snake_case 全局策略下可绑定）。 */
    @Test
    void frontendPayloadBindsToRequestRecord() throws Exception {
        String json = """
                {"routes":[
                  {"name":"api_gateway_1","uri":"http://user-service:8080",
                   "predicates":["Path=/api/**","Host=api.example.com"],
                   "filters":["AddRequestHeader=X-Foo, bar","StripPrefix=1"],
                   "order":10,"metadata":{"team":"core"},
                   "environment":"default","remark":"","tags":""}
                ]}
                """;
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

        RouteController.BatchCreateRequest request =
                mapper.readValue(json, RouteController.BatchCreateRequest.class);

        assertEquals(1, request.routes().size());
        RouteController.BatchRouteRequest route = request.routes().get(0);
        assertEquals("api_gateway_1", route.name());
        assertEquals("http://user-service:8080", route.uri());
        assertEquals(List.of("Path=/api/**", "Host=api.example.com"), route.predicates());
        assertEquals(List.of("AddRequestHeader=X-Foo, bar", "StripPrefix=1"), route.filters());
        assertEquals(10, route.order());
        assertEquals("default", route.environment());
        assertNotNull(route.metadata());
        assertEquals("core", route.metadata().get("team").asText());
    }

    /** 未知字段（旧 K8s 形态 rules/pathType/上游 upstream_url 等）不得炸 —— 忽略。 */
    @Test
    void unknownFieldsAreIgnored() throws Exception {
        String json = """
                {"routes":[{"name":"api_gateway_1","uri":"http://user-service:8080",
                  "predicates":["Path=/api/**"],
                  "upstream_url":"http://x:80","rules":[],"pathType":"PREFIX"}]}
                """;
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        RouteController.BatchCreateRequest request =
                mapper.readValue(json, RouteController.BatchCreateRequest.class);
        assertEquals("api_gateway_1", request.routes().get(0).name());
        assertEquals("http://user-service:8080", request.routes().get(0).uri());
    }

    /** 响应 data：snake_case 键 + route_id 序列化为字符串（雪花 ID → String 契约）。 */
    @Test
    void createdResultSerializesWithSnakeCaseKeys() throws Exception {
        ObjectMapper mapper = new ObjectMapper()
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        SimpleModule longToString = new SimpleModule();
        longToString.addSerializer(Long.class, ToStringSerializer.instance);
        mapper.registerModule(longToString);

        String json = mapper.writeValueAsString(new RouteController.BatchCreateResult(
                List.of(new RouteController.BatchCreatedRoute(
                        123L, "api_gateway_1", "http://user-service:8080",
                        "/api/**", 1, 1))));

        assertTrue(json.contains("\"route_id\":\"123\""), json);
        assertTrue(json.contains("\"route_name\":\"api_gateway_1\""), json);
        assertTrue(json.contains("\"uri\":\"http://user-service:8080\""), json);
        assertTrue(json.contains("\"path\":\"/api/**\""), json);
        assertTrue(json.contains("\"predicates_count\":1"), json);
        assertTrue(json.contains("\"filters_count\":1"), json);
        assertTrue(json.contains("\"created\""), json);
    }

    /** name 字段 Bean Validation 契约：@NotBlank + ^[a-zA-Z0-9_]{2,50}$（与 §4.2 一致）。 */
    @Test
    void routeNameValidationContractOnRecord() throws Exception {
        var nameAccessor = RouteController.BatchRouteRequest.class.getDeclaredMethod("name");
        NotBlank notBlank = nameAccessor.getAnnotation(NotBlank.class);
        assertNotNull(notBlank, "BatchRouteRequest.name 必须 @NotBlank");
        Pattern pattern = nameAccessor.getAnnotation(Pattern.class);
        assertNotNull(pattern, "BatchRouteRequest.name 必须 @Pattern");
        assertEquals("^[a-zA-Z0-9_]{2,50}$", pattern.regexp());
    }

    /** uri 字段 Bean Validation 契约：@NotBlank + ^https?://\\S+$，文案点明格式与示例。 */
    @Test
    void uriValidationContractOnRecord() throws Exception {
        var uriAccessor = RouteController.BatchRouteRequest.class.getDeclaredMethod("uri");
        Pattern pattern = uriAccessor.getAnnotation(Pattern.class);
        assertNotNull(pattern, "BatchRouteRequest.uri 必须 @Pattern");
        assertEquals("^https?://\\S+$", pattern.regexp());
        assertTrue(pattern.message().contains("http://"), pattern.message());
        assertTrue(pattern.message().contains("https://"), pattern.message());
        assertTrue(pattern.message().contains("http://user-service:8080"), pattern.message());
        NotBlank notBlank = uriAccessor.getAnnotation(NotBlank.class);
        assertNotNull(notBlank, "BatchRouteRequest.uri 必须 @NotBlank");
    }
}
