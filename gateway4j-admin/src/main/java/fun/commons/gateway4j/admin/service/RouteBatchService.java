package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiException;
import fun.commons.gateway4j.admin.controller.RouteController;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteFilterMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePredicateMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteFilter;
import fun.commons.gateway4j.common.model.RoutePredicate;
import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * S12-7b：管理面批量建路由服务（SCG {@code RouteDefinition} 1:1 形态，
 * 契约 docs/API_CONTRACT.md §19.1 / docs/ui-v2/实施契约.md §10.1）。
 *
 * <p>取代 S12-3 的 {@code RouteIngressService}（K8s Ingress 形态已随本票删除，
 * 避免双真相源）。编排骨架（一个事务、重名预检、AFTER_COMMIT 配置变更事件）
 * 沿用其先例，路由展开逻辑按 SCG 1:1 重写。</p>
 *
 * <p>映射口径（§19.1.3，全部「原样落库」，服务端不合成、不改写）：</p>
 * <ul>
 *   <li>{@code name} → {@code route_name}（<b>不自动追加序号</b>，1:1 形态下路由名
 *       由用户给；须合 {@code ^[a-zA-Z0-9_]{2,50}$}）。</li>
 *   <li>{@code uri} → {@code upstream_url}（SCG {@code RouteDefinition.uri} 同名同义，
 *       单一真相源；须合 {@code ^https?://\S+$}）。</li>
 *   <li><b>{@code Path=} 谓词抽取</b>：pattern 落 {@code gw_route.path}，<b>不另落</b>
 *       {@code gw_route_predicate} 行（引擎注册层由 path 生成唯一 Path 谓词，重复
 *       落行会双评）。一条路由<b>最多一个</b> {@code Path=}；{@code Path=/a,/b}
 *       多 pattern 形态不支持；无 {@code Path=} 允许（path 落 null，SCG 原生语义）。</li>
 *   <li>其余谓词 → {@code gw_route_predicate.definition}（sort_order 从 0 递增）。</li>
 *   <li>{@code filters[]} → {@code gw_route_filter.definition}（sort_order = 数组下标）。</li>
 *   <li>{@code order} → {@code sort_order}（缺省 0）；{@code metadata} → JSON 字符串
 *       落 {@code Route.metadata}（JSONB，缺省 {@code {}}）。</li>
 *   <li>{@code route_type} 一律 BACKEND；{@code status} 一律 DRAFT（需另行 publish
 *       才在网关生效，与单条创建 §4.2 一致）。</li>
 * </ul>
 *
 * <p>校验口径：<b>写入侧只做结构校验</b>（非空、长度 ≤500 与 DDL 的 VARCHAR(500)
 * 一致、Path= 值形态），定义串<b>语义合法性（未知 filter/谓词名等）不校验</b> ——
 * 由引擎装配期语义兜底（未知名跳过 / 已知名坏参恒不匹配，S12-7a 已做），admin
 * 模块不引入 gateway4j-engine 之外的 SCG 类依赖。</p>
 *
 * <p>错误码（§19.1.5）：字段级/结构校验失败 = {@code 10100}（framework4j
 * {@link ApiCode#PARAM_ERROR}，与 Bean Validation 的 REQUIRED_MISSING/FORMAT_INVALID
 * 同码）；同环境重名（批内重复或已入库）= {@code 10609}
 * {@link ErrorCode#ROUTE_NAME_CONFLICT}（整单拒收）；落库失败 =
 * {@code 10605} {@link ErrorCode#CONFIG_SYNC_FAILED}。</p>
 */
@Service
public class RouteBatchService {

    /** 路由名字符集与长度口径（对齐 RouteCreateRequest.routeName）。 */
    private static final String NAME_PATTERN = "^[a-zA-Z0-9_]{2,50}$";

    /** 上游地址格式（对齐 RouteCreateRequest.upstreamUrl 的校验口径）。 */
    private static final String UPSTREAM_PATTERN = "^https?://\\S+$";

    /** uri 非法时的统一错误文案（点明格式 + 示例；与 Controller 的 @Pattern 文案同口径）。 */
    private static final String URI_FORMAT_HINT =
            "上游地址须为 http:// 或 https:// 开头的完整上游地址（例：http://user-service:8080）";

    /** 定义串最大长度（gw_route_filter / gw_route_predicate 的 definition VARCHAR(500)）。 */
    private static final int MAX_DEFINITION_LENGTH = 500;

    /** Path 谓词值最大长度（gw_route.path VARCHAR(500)）。 */
    private static final int MAX_PATH_LENGTH = 500;

    /** SCG Path 谓词定义串前缀（名字大小写敏感，= SCG {@code PathRoutePredicateFactory#name()}）。 */
    private static final String PATH_PREDICATE_PREFIX = "Path=";

    private final RouteMapper routeMapper;
    private final RoutePredicateMapper predicateMapper;
    private final RouteFilterMapper filterMapper;
    private final ApplicationEventPublisher eventPublisher;

    public RouteBatchService(RouteMapper routeMapper,
                             RoutePredicateMapper predicateMapper,
                             RouteFilterMapper filterMapper,
                             ApplicationEventPublisher eventPublisher) {
        this.routeMapper = routeMapper;
        this.predicateMapper = predicateMapper;
        this.filterMapper = filterMapper;
        this.eventPublisher = eventPublisher;
    }

    /**
     * 批量建路由（一个事务，中途失败全量回滚，不留半成品路由）。
     *
     * @return 创建成功的路由清单（route_id / route_name / uri / path / 谓词与 filter 行数）
     */
    @Transactional
    public RouteController.BatchCreateResult createBatch(RouteController.BatchCreateRequest request) {
        if (request == null || request.routes() == null || request.routes().isEmpty()) {
            throw paramError("routes 不能为空（至少一条路由）");
        }

        // 先逐条解析（校验 + Path= 抽取 + metadata 序列化）→ 任一条非法即整单拒收、零落库
        List<Plan> plans = new ArrayList<>();
        for (RouteController.BatchRouteRequest item : request.routes()) {
            plans.add(buildPlan(item));
        }
        // 重名预检：批内（同环境）重复 + 已入库（同环境）同名 → 10609
        checkNameConflicts(plans);

        List<RouteController.BatchCreatedRoute> created = new ArrayList<>();
        for (Plan plan : plans) {
            Route route = Route.builder()
                    .routeName(plan.routeName())
                    .routeType("BACKEND")
                    .path(plan.path())
                    .upstreamUrl(plan.uri())
                    .status("DRAFT")
                    .sortOrder(plan.order())
                    .remark(plan.remark())
                    .tags(plan.tags())
                    .environment(plan.environment())
                    .metadata(plan.metadata())
                    .build();
            if (routeMapper.insert(route) <= 0) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                        "路由落库失败：" + plan.routeName());
            }
            Long routeId = route.getId();

            for (int i = 0; i < plan.predicates().size(); i++) {
                insertPredicate(routeId, plan.predicates().get(i), i);
            }
            for (int i = 0; i < plan.filters().size(); i++) {
                insertFilter(routeId, plan.filters().get(i), i);
            }

            created.add(new RouteController.BatchCreatedRoute(routeId, plan.routeName(),
                    plan.uri(), plan.path(), plan.predicates().size(), plan.filters().size()));
        }

        // 配置变更通知整批只发 1 条（ConfigChangeNotifier AFTER_COMMIT 广播 →
        // Redis 驱动网关全量重载，逐条发 N 条只会造成 N 次无谓重载，沿用 S12-3 先例）
        if (!created.isEmpty()) {
            eventPublisher.publishEvent(new ConfigChangeEvent(this, "ROUTE",
                    created.get(0).routeId(), 0L, "CREATE"));
        }
        return new RouteController.BatchCreateResult(created);
    }

    // ==================== 单条解析（校验 + 映射） ====================

    /** 一条待建路由的落库计划。 */
    private record Plan(String routeName, String uri, String path, List<String> predicates,
                        List<String> filters, Integer order, String metadata,
                        String environment, String remark, String tags) {}

    /** Path= 抽取结果：抽取出的 pattern（可为 null）+ 剩余谓词定义串。 */
    private record PathExtraction(String path, List<String> remainingPredicates) {}

    private Plan buildPlan(RouteController.BatchRouteRequest item) {
        if (item == null) {
            throw paramError("routes[n] 不能为空");
        }
        String name = item.name() == null ? "" : item.name().trim();
        if (name.isEmpty()) {
            throw paramError("路由名称不能为空");
        }
        if (!name.matches(NAME_PATTERN)) {
            throw paramError("路由名称须为 2-50 位字母、数字或下划线（" + NAME_PATTERN + "）：" + name);
        }
        String uri = normalizeUri(item.uri());
        // environment 白名单口径同既有创建路由（缺省 default，非法值业务异常拒收）
        String environment = RouteService.normalizeEnvironment(item.environment());

        List<String> predicates = sanitizeDefinitions(item.predicates());
        List<String> filters = sanitizeDefinitions(item.filters());
        for (String definition : predicates) {
            requireDefinitionLength(name, definition, "谓词");
        }
        for (String definition : filters) {
            requireDefinitionLength(name, definition, "filter");
        }
        // Path= 抽取（契约 §19.1.4：最多一个；多 pattern 拒收；值须以 / 开头且不含空白）
        PathExtraction extraction = extractPath(name, predicates);

        // metadata：对象 → 紧凑 JSON 字符串（JSONB 落点）；null/缺省 → "{}"
        String metadata = item.metadata() != null
                ? JsonUtils.toCompactJson(item.metadata()) : "{}";

        return new Plan(name, uri, extraction.path(), extraction.remainingPredicates(),
                filters, item.order() != null ? item.order() : 0, metadata,
                environment, item.remark(), item.tags() != null ? item.tags() : "");
    }

    /**
     * {@code Path=} 谓词抽取（契约 §19.1.3/§19.1.4）：pattern 落 {@code gw_route.path}，
     * 不再保留在谓词列表里（引擎注册层由 path 生成唯一 Path 谓词，重复落行会双评）。
     *
     * <ul>
     *   <li>多个 {@code Path=} 条目 → 10100（gw_route.path 单值，数据模型无法承载）；</li>
     *   <li>单条目内逗号多 pattern（{@code Path=/a,/b}）→ 10100（SCG 原生的 GATHER_LIST
     *       形态，本数据模型是单值，明确不支持不做静默降级）；</li>
     *   <li>值非法（空 / 不以 {@code /} 开头 / 含空白 / 超 500）→ 10100（path 列既有口径）；</li>
     *   <li>没有 {@code Path=} → 允许（path = null，SCG 原生语义：路由不限路径）。</li>
     * </ul>
     */
    private PathExtraction extractPath(String routeName, List<String> predicates) {
        String path = null;
        List<String> remaining = new ArrayList<>();
        for (String definition : predicates) {
            if (!definition.startsWith(PATH_PREDICATE_PREFIX)) {
                remaining.add(definition);
                continue;
            }
            if (path != null) {
                throw paramError("路由 " + routeName + " 只允许一个 Path= 谓词"
                        + "（gw_route.path 为单值列）：(" + path + ") 与 (" + definition + ")");
            }
            path = validatePathPattern(routeName, definition.substring(PATH_PREDICATE_PREFIX.length()));
        }
        predicates.clear();
        predicates.addAll(remaining);
        return new PathExtraction(path, predicates);
    }

    private String validatePathPattern(String routeName, String rawPattern) {
        String pattern = rawPattern.trim();
        if (pattern.isEmpty()) {
            throw paramError("路由 " + routeName + " 的 Path= 谓词值不能为空");
        }
        if (pattern.contains(",")) {
            throw paramError("路由 " + routeName + " 的 Path= 谓词不支持多 pattern"
                    + "（Path=/a,/b 形态，gw_route.path 为单值列）：" + pattern);
        }
        if (pattern.matches(".*\\s.*")) {
            throw paramError("路由 " + routeName + " 的 Path= 谓词值不能含空白字符：" + pattern);
        }
        if (!pattern.startsWith("/")) {
            throw paramError("路由 " + routeName + " 的 Path= 谓词值须以 / 开头：" + pattern);
        }
        if (pattern.length() > MAX_PATH_LENGTH) {
            throw paramError("路由 " + routeName + " 的 Path= 谓词值超长（≤" + MAX_PATH_LENGTH
                    + " 与 DDL 一致）");
        }
        return pattern;
    }

    /**
     * uri 归一 + 校验（SCG {@code RouteDefinition.uri} 同名同义 = 完整上游地址
     * {@code scheme://host[:port]}），trim 后原样落 {@code gw_route.upstream_url}
     * —— 服务端不合成 scheme/端口（单一真相源）。
     */
    static String normalizeUri(String rawUri) {
        String uri = rawUri == null ? "" : rawUri.trim();
        if (uri.isEmpty()) {
            throw paramError("上游地址不能为空。" + URI_FORMAT_HINT);
        }
        if (!uri.matches(UPSTREAM_PATTERN)) {
            throw paramError(URI_FORMAT_HINT + "：" + uri);
        }
        try {
            URI.create(uri);
        } catch (IllegalArgumentException e) {
            throw paramError(URI_FORMAT_HINT + "：" + uri);
        }
        return uri;
    }

    /** 定义串清洗：去空白、丢弃空串（其余原样落库，不做语义校验）。 */
    private List<String> sanitizeDefinitions(List<String> definitions) {
        if (definitions == null || definitions.isEmpty()) {
            return new ArrayList<>();
        }
        List<String> result = new ArrayList<>();
        for (String definition : definitions) {
            if (definition == null) {
                continue;
            }
            String trimmed = definition.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    /** 定义串长度结构校验（≤500 与 DDL 的 VARCHAR(500) 一致，超长入库必炸 → 前置拒收）。 */
    private void requireDefinitionLength(String routeName, String definition, String kind) {
        if (definition.length() > MAX_DEFINITION_LENGTH) {
            throw paramError("路由 " + routeName + " 的" + kind + "定义串超长（≤"
                    + MAX_DEFINITION_LENGTH + "，与 DDL VARCHAR(500) 一致）");
        }
    }

    // ==================== 落库 ====================

    private void insertPredicate(Long routeId, String definition, int sortOrder) {
        RoutePredicate predicate = RoutePredicate.builder()
                .routeId(routeId)
                .definition(definition)
                .sortOrder(sortOrder)
                .build();
        if (predicateMapper.insert(predicate) <= 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "谓词落库失败：" + definition);
        }
    }

    private void insertFilter(Long routeId, String definition, int sortOrder) {
        RouteFilter filter = RouteFilter.builder()
                .routeId(routeId)
                .definition(definition)
                .sortOrder(sortOrder)
                .build();
        if (filterMapper.insert(filter) <= 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "filter 落库失败：" + definition);
        }
    }

    /**
     * 重名预检（契约 §19.1.5 = 10609，整单不落库）：
     * ① 批内同环境重名；② 已入库同名（uk_route_environment_name 部分唯一索引，
     * 同环境内同名即冲突；不同环境允许同名）。
     */
    private void checkNameConflicts(List<Plan> plans) {
        Map<String, Set<String>> seenByEnv = new LinkedHashMap<>();
        for (Plan plan : plans) {
            Set<String> names = seenByEnv.computeIfAbsent(plan.environment(), k -> new HashSet<>());
            if (!names.add(plan.routeName())) {
                throw new BusinessException(ErrorCode.ROUTE_NAME_CONFLICT,
                        plan.routeName() + "（批内重复）");
            }
        }
        for (Map.Entry<String, Set<String>> entry : seenByEnv.entrySet()) {
            List<Route> existing = routeMapper.selectList(new LambdaQueryWrapper<Route>()
                    .eq(Route::getEnvironment, entry.getKey())
                    .in(Route::getRouteName, entry.getValue()));
            if (existing != null && !existing.isEmpty()) {
                throw new BusinessException(ErrorCode.ROUTE_NAME_CONFLICT, existing.get(0).getRouteName());
            }
        }
    }

    /** 结构校验失败统一 10100（ApiCode.PARAM_ERROR，契约 §19.1.5 字段级校验口径）。 */
    private static ApiException paramError(String message) {
        return new ApiException(ApiCode.PARAM_ERROR, message);
    }
}
