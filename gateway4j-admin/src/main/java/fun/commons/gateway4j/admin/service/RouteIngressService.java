package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * S12-3：管理面批量 Ingress 建路由服务（契约 docs/ui-v2/实施契约.md §10）。
 *
 * <p>把一份 K8s Ingress 形态的请求（rules[] = host + paths[]）一次性落成 N 条
 * <b>普通 BACKEND 路由</b>：每条 (host, path) 一条路由，host 走<b>路由级 SCG 原生
 * 谓词行</b>（gw_route_predicate.definition = {@code Host={host}}），不再需要
 * DISPATCH 父路由 + 条件那套近似机制 —— 语义由 SCG 构造保证 100% 对齐。</p>
 *
 * <p>映射口径（§10 裁决）：</p>
 * <ul>
 *   <li>pathType 三值：{@code PREFIX} → {@code /api} 补成 {@code /api/**}（已带
 *       {@code /**} 或 {@code /*} 则原样）；{@code EXACT} / {@code IMPLEMENTATION_SPECIFIC}
 *       原样（后者允许 SCG PathPattern 片段如 {@code /api/{id:[0-9]+}}）。</li>
 *   <li>backend → upstream_url：{@code http://{service}[:{port}]}；service 自带
 *       scheme（{@code http://x} / {@code https://x}）则保留其 scheme；port 为空则
 *       不带端口；service 为空 → 拒收。合成结果过 {@code ^https?://\S+$} 校验。</li>
 *   <li>命名：{@code route_name = <name>_<序号>}（序号从 1 起全局连续），须合
 *       {@code ^[a-zA-Z0-9_]{2,50}$}（超长截断 name 部分）。</li>
 *   <li>事务：整个请求一个事务（{@code @Transactional}），中途失败全量回滚，
 *       不留半成品路由。</li>
 * </ul>
 *
 * <p>校验前置（比单条创建更严，批量会放大风险）：rules 非空、每条 rule 至少一个
 * path、path 必填且以 / 开头、service 必填、port 须为数字、environment 合法
 * （白名单口径同 {@link RouteService#normalizeEnvironment}）、plugin_id 必须真实
 * 存在（查 gw_plugin）→ 否则整单拒收。</p>
 */
@Service
public class RouteIngressService {

    /** 基础名 / 合成子路由名的字符集与长度口径（对齐 RouteCreateRequest.routeName）。 */
    private static final String NAME_PATTERN = "^[a-zA-Z0-9_]{2,50}$";

    /** 合成路由名最大长度（gw_route.route_name VARCHAR(50)）。 */
    private static final int MAX_ROUTE_NAME_LENGTH = 50;

    /** 上游地址格式（对齐 RouteCreateRequest.upstreamUrl 的校验口径）。 */
    private static final String UPSTREAM_PATTERN = "^https?://\\S+$";

    /** service 自带 scheme 时按此拆分（保留其 scheme，不做 URL 反序列化）。 */
    private static final Pattern SCHEME_PATTERN = Pattern.compile("^(https?)://(.*)$", Pattern.CASE_INSENSITIVE);

    private final RouteMapper routeMapper;
    private final RoutePredicateMapper predicateMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final PluginMapper pluginMapper;
    private final ApplicationEventPublisher eventPublisher;

    public RouteIngressService(RouteMapper routeMapper,
                               RoutePredicateMapper predicateMapper,
                               RoutePluginBindingMapper bindingMapper,
                               PluginMapper pluginMapper,
                               ApplicationEventPublisher eventPublisher) {
        this.routeMapper = routeMapper;
        this.predicateMapper = predicateMapper;
        this.bindingMapper = bindingMapper;
        this.pluginMapper = pluginMapper;
        this.eventPublisher = eventPublisher;
    }

    /**
     * 批量建路由（一个事务）。
     *
     * @return 创建成功的路由清单（route_id / route_name / path / host）
     */
    @Transactional
    public RouteController.IngressCreateResult createIngress(RouteController.IngressCreateRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "请求体不能为空");
        }
        String baseName = request.name() == null ? "" : request.name().trim();
        if (baseName.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "基础名称不能为空");
        }
        if (!baseName.matches(NAME_PATTERN)) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "基础名称须为 2-50 位字母、数字或下划线（" + NAME_PATTERN + "）");
        }
        // environment 白名单口径同既有创建路由（缺省 default，非法值业务异常拒收）
        String environment = RouteService.normalizeEnvironment(request.environment());
        String remark = request.remark();
        String tags = request.tags() != null ? request.tags() : "";

        List<Plan> plans = buildPlans(request.rules(), baseName);
        // 插件先解析（plugin_id 不存在 → 整单拒收，不静默跳过绑定）
        List<PluginRef> plugins = resolvePlugins(request.plugins());
        List<String> topLevelPredicates = sanitizeDefinitions(request.predicates());
        // 同环境内同名即冲突（uk_route_environment_name 部分唯一索引）→ 预检给出明确错误码
        checkNameConflicts(environment, plans.stream().map(Plan::routeName).toList());

        List<RouteController.IngressCreatedRoute> created = new ArrayList<>();
        for (Plan plan : plans) {
            Route route = Route.builder()
                    .routeName(plan.routeName())
                    .routeType("BACKEND")
                    .path(plan.path())
                    .upstreamUrl(plan.upstreamUrl())
                    .status("DRAFT")
                    .sortOrder(plan.seq())
                    .remark(remark)
                    .tags(tags)
                    .environment(environment)
                    .build();
            if (routeMapper.insert(route) <= 0) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                        "路由落库失败：" + plan.routeName());
            }
            Long routeId = route.getId();

            // 路由级 SCG 原生谓词行：host 谓词在前，顶层 predicates[] 依次在后
            int predicateOrder = 0;
            if (!plan.host().isEmpty()) {
                insertPredicate(routeId, "Host=" + plan.host(), predicateOrder++);
            }
            for (String definition : topLevelPredicates) {
                insertPredicate(routeId, definition, predicateOrder++);
            }

            // 插件绑定行（sort_order 递增）
            for (int i = 0; i < plugins.size(); i++) {
                PluginRef ref = plugins.get(i);
                RoutePluginBinding binding = RoutePluginBinding.builder()
                        .routeId(routeId)
                        .pluginId(ref.pluginId())
                        .sortOrder(i)
                        .bindingConfig(ref.bindingConfig())
                        .build();
                if (bindingMapper.insert(binding) <= 0) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                            "插件绑定落库失败：" + ref.pluginCode());
                }
            }

            created.add(new RouteController.IngressCreatedRoute(
                    routeId, plan.routeName(), plan.path(), plan.host()));
        }

        // 配置变更通知：ConfigChangeNotifier 以 AFTER_COMMIT 监听 → 事务提交后才广播
        // Redis 驱动网关重载（engine 侧 loadAllConfig 全量重载），故整批发一条即可，
        // 逐条发 N 条只会造成 N 次无谓的全量重载。
        if (!created.isEmpty()) {
            eventPublisher.publishEvent(new ConfigChangeEvent(this, "ROUTE",
                    created.get(0).routeId(), 0L, "CREATE"));
        }
        return new RouteController.IngressCreateResult(created);
    }

    // ==================== 计划展开（校验 + 映射） ====================

    /** 一条待建路由的展开计划（seq = 全局连续序号，从 1 起）。 */
    private record Plan(int seq, String routeName, String path, String upstreamUrl, String host) {}

    /** 解析后的插件引用（gw_plugin.id + 绑定配置）。 */
    private record PluginRef(Long pluginId, String pluginCode, String bindingConfig) {}

    private List<Plan> buildPlans(List<RouteController.IngressRuleRequest> rules, String baseName) {
        if (rules == null || rules.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "规则不能为空（零命中拒收）");
        }
        List<Plan> plans = new ArrayList<>();
        int seq = 0;
        for (RouteController.IngressRuleRequest rule : rules) {
            if (rule == null) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "规则不能为空");
            }
            List<RouteController.IngressPathRequest> paths = rule.paths();
            if (paths == null || paths.isEmpty()) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "每条规则至少包含一个路径");
            }
            String host = rule.host() == null ? "" : rule.host().trim();
            for (RouteController.IngressPathRequest path : paths) {
                if (path == null) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路径不能为空");
                }
                String rawPath = path.path() == null ? "" : path.path().trim();
                if (rawPath.isEmpty()) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路径不能为空");
                }
                if (!rawPath.startsWith("/")) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路径须以 / 开头：" + rawPath);
                }
                if (rawPath.matches(".*\\s.*")) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路径不能含空白字符：" + rawPath);
                }
                RouteController.IngressBackendRequest backend = path.backend();
                if (backend == null || backend.service() == null || backend.service().trim().isEmpty()) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "服务名不能为空");
                }
                String port = backend.port() == null ? "" : backend.port().trim();
                if (!port.isEmpty() && !port.matches("^\\d+$")) {
                    throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "端口须为数字：" + port);
                }
                seq++;
                plans.add(new Plan(seq, deriveRouteName(baseName, seq),
                        translatePath(rawPath, path.pathType()),
                        buildUpstreamUrl(backend.service(), port),
                        host));
            }
        }
        return plans;
    }

    /**
     * pathType → SCG 路径映射（§10 裁决）：
     * PREFIX → 补 {@code /**}（已带 {@code /**} / {@code /*} 则原样）；其余两值原样。
     */
    static String translatePath(String rawPath, String pathType) {
        String type = pathType == null || pathType.isBlank()
                ? "PREFIX" : pathType.trim().toUpperCase(Locale.ROOT);
        if (!"PREFIX".equals(type)) {
            return rawPath;
        }
        if (rawPath.endsWith("/**") || rawPath.endsWith("/*")) {
            return rawPath;
        }
        if (rawPath.endsWith("/")) {
            return rawPath + "**";
        }
        return rawPath + "/**";
    }

    /**
     * backend → upstream_url：{@code http://{service}[:{port}]}。
     * service 自带 scheme 时保留其 scheme；带端口且另给 port 时以 port 覆盖；
     * port 为空则不带端口。合成结果过 {@code ^https?://\S+$} 校验（对齐既有创建路由）。
     */
    static String buildUpstreamUrl(String service, String port) {
        String svc = service.trim();
        String p = port == null ? "" : port.trim();
        String scheme = "http";
        String rest = svc;
        Matcher matcher = SCHEME_PATTERN.matcher(svc);
        if (matcher.matches()) {
            scheme = matcher.group(1).toLowerCase(Locale.ROOT);
            rest = matcher.group(2);
        }
        if (!p.isEmpty()) {
            rest = rest.replaceFirst(":\\d+$", "");
            rest = rest + ":" + p;
        }
        String url = scheme + "://" + rest;
        if (!url.matches(UPSTREAM_PATTERN)) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "上游地址非法：" + url);
        }
        return url;
    }

    /** 合成子路由名：{@code <name>_<序号>}，超长截断 name 部分（总量 ≤ 50）。 */
    static String deriveRouteName(String baseName, int seq) {
        String suffix = "_" + seq;
        String head = baseName;
        if (head.length() + suffix.length() > MAX_ROUTE_NAME_LENGTH) {
            head = head.substring(0, Math.max(1, MAX_ROUTE_NAME_LENGTH - suffix.length()));
        }
        return head + suffix;
    }

    // ==================== 插件 / 谓词 / 冲突 ====================

    /** plugin_id（gw_plugin.plugin_id）→ gw_plugin.id；不存在 → 整单拒收。 */
    private List<PluginRef> resolvePlugins(List<RouteController.IngressPluginRequest> plugins) {
        if (plugins == null || plugins.isEmpty()) {
            return List.of();
        }
        List<PluginRef> refs = new ArrayList<>();
        for (RouteController.IngressPluginRequest request : plugins) {
            if (request == null || request.pluginId() == null || request.pluginId().trim().isEmpty()) {
                throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND, "插件标识不能为空");
            }
            String code = request.pluginId().trim();
            Plugin plugin = pluginMapper.selectOne(
                    new LambdaQueryWrapper<Plugin>().eq(Plugin::getPluginId, code));
            if (plugin == null || plugin.getId() == null) {
                throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND, "插件不存在：" + code);
            }
            String config = request.bindingConfig() != null && !request.bindingConfig().isBlank()
                    ? request.bindingConfig() : "{}";
            refs.add(new PluginRef(plugin.getId(), code, config));
        }
        return refs;
    }

    /** 顶层 predicates[] 清洗：去空白、丢弃空串（其余原样落库）。 */
    private List<String> sanitizeDefinitions(List<String> definitions) {
        if (definitions == null || definitions.isEmpty()) {
            return List.of();
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

    /** 同环境内路由名冲突预检（uk_route_environment_name 部分唯一索引）。 */
    private void checkNameConflicts(String environment, List<String> names) {
        if (names.isEmpty()) {
            return;
        }
        List<Route> existing = routeMapper.selectList(new LambdaQueryWrapper<Route>()
                .eq(Route::getEnvironment, environment)
                .in(Route::getRouteName, names));
        if (existing != null && !existing.isEmpty()) {
            throw new BusinessException(ErrorCode.ROUTE_NAME_CONFLICT, existing.get(0).getRouteName());
        }
    }
}
