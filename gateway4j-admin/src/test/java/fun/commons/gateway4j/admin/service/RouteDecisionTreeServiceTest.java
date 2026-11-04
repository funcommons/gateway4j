package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 路由决策树聚合服务单测 —— 对应契约 §4 S7a（docs/ui-v2/实施契约.md + S7a 已裁决接口契约）。
 *
 * <p><b>测试先行</b>：被测类尚未实现时本文件会使 admin 测试编译失败——这是预期流程，
 * C-agent 按本文件实现 {@code RouteDecisionTreeService} 后由 R-agent 跑。</p>
 *
 * <p><b>期望构造签名</b>（契约固定）：
 * <pre>
 * public RouteDecisionTreeService(RouteMapper routeMapper,
 *                                 RouteConditionMapper conditionMapper,
 *                                 RouteTrafficSummaryService trafficSummaryService)
 * public Map&lt;String, Object&gt; decisionTree(Long routeId)
 * </pre>
 *
 * <p><b>查询铁律（T9 固化）</b>：routeMapper.selectList 与 conditionMapper.selectList
 * 各恰好 1 次（全量拉取内存组 childrenMap/conditionMap，5 层最坏 O(b^5) N+1 严禁），
 * trafficSummaryService.summary() 恰好 1 次（行 key=route_id）。</p>
 *
 * <p><b>响应 Map 契约（snake_case，id 一律 String.valueOf 防 JS 精度丢失）</b>：
 * <ul>
 *   <li>根：route_id / route_name / route_type / path / upstream_url / status /
 *       environment / max_depth(=5) / source(透传 summary 行 source) /
 *       totals{hits_24h:long, qps:double} / children[]</li>
 *   <li>分支 BranchNode：target_route_id / target_route_name / target_route_type /
 *       target_path / target_upstream_url / target_resolvable(目标存在且
 *       status==PUBLISHED) / is_nested(目标 routeType==DISPATCH) / priority(int) /
 *       condition{condition_type, operator, condition_key, condition_value} /
 *       weight(仅 WEIGHT 且解析&gt;0 为 Integer——admin 显示层口径（引擎侧
 *       RouteDispatcher.parseWeight 为 Long.parseLong >0 即有效、long 全域参与加权，
 *       超 int 上限仍真实分流；此处 null 仅为显示约束）：空/非数字/≤0/超 int 上限
 *       不显示；其余一律 null) / hits_24h(Long 可 null: summary 无行) /
 *       qps(Double 可 null) / p95_latency_ms(可 null) /
 *       hit_ratio(double: 本层分支 hits_24h / Σ分支 hits_24h，Σ=0 → 0.0 不除零) /
 *       children[]（嵌套，深≤5，visited 防环）</li>
 *   <li>children 只按「条件边的 target」生成（未被指向的路由不出现）；同一 target
 *       多条条件 → 每条条件一个 BranchNode，按 priority 升序；被指向的 BACKEND 叶子
 *       is_nested=false 且 children 为空数组</li>
 *   <li>routeId 不存在 → BusinessException(ROUTE_NOT_FOUND)</li>
 * </ul>
 *
 * <p><b>fixture 口径说明</b>：所有 path 均不含数字/UUID 段（normalizePath 恒等），
 * 避免「raw path vs 归一化 path」歧义；summary 桩行只带实现允许消费的最小键集
 * （route_id/hits_24h/qps/p95_latency_ms/source）——实现不得依赖其余键。</p>
 */
@ExtendWith(MockitoExtension.class)
class RouteDecisionTreeServiceTest {

    private static final String PROMETHEUS = "prometheus";

    /** 契约固定的分支节点字段全集（只断言 containsKey，不禁止实现附带额外键）。 */
    private static final List<String> BRANCH_KEYS = List.of(
            "target_route_id", "target_route_name", "target_route_type", "target_path",
            "target_upstream_url", "target_resolvable", "is_nested", "priority",
            "condition", "weight", "hits_24h", "qps", "p95_latency_ms", "hit_ratio", "children");

    /** 契约固定的根节点字段全集。 */
    private static final List<String> ROOT_KEYS = List.of(
            "route_id", "route_name", "route_type", "path", "upstream_url", "status",
            "environment", "max_depth", "source", "totals", "children");

    @Mock private RouteMapper routeMapper;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RouteTrafficSummaryService trafficSummaryService;

    private RouteDecisionTreeService service;

    @BeforeEach
    void setUp() {
        // 纯单测无 MyBatis-Plus 启动流程：手动注册 Route/RouteCondition 的 TableInfo，
        // 否则服务内 LambdaQueryWrapper 解析实体 lambda 时报
        // "can not find lambda cache for this entity"（同 RouteVersionServiceTest 先例）。
        // mock mapper.selectList(any()) 直接回桩数据，不解析 SQL。
        if (TableInfoHelper.getTableInfo(Route.class) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), Route.class);
        }
        if (TableInfoHelper.getTableInfo(RouteCondition.class) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), RouteCondition.class);
        }
        service = new RouteDecisionTreeService(routeMapper, conditionMapper, trafficSummaryService);
    }

    // ==================== fixture 工具 ====================

    private Route route(long id, String name, String type, String path, String upstream, String status) {
        return Route.builder()
                .id(id).routeName(name).routeType(type)
                .path(path).upstreamUrl(upstream)
                .status(status).environment("prod")
                .build();
    }

    private RouteCondition cond(long id, long routeId, long targetId,
                                String type, String operator, String key, String value, int priority) {
        return RouteCondition.builder()
                .id(id).routeId(routeId).targetRouteId(targetId)
                .conditionType(type).operator(operator)
                .conditionKey(key).conditionValue(value)
                .priority(priority)
                .build();
    }

    /** summary() 桩行最小键集：实现按 route_id join，不得依赖其余键。 */
    private Map<String, Object> summaryRow(Object routeId, long hits, double qps, Double p95, String source) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("route_id", String.valueOf(routeId));
        row.put("hits_24h", hits);
        row.put("qps", qps);
        row.put("p95_latency_ms", p95);
        row.put("source", source);
        return row;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> children(Map<String, Object> node) {
        return (List<Map<String, Object>>) node.get("children");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> totals(Map<String, Object> root) {
        return (Map<String, Object>) root.get("totals");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> condition(Map<String, Object> branch) {
        return (Map<String, Object>) branch.get("condition");
    }

    /** 按目标路由 id 找分支（同一 target 多条条件的用例不得使用本 helper，见 T2b）。 */
    private static Map<String, Object> branch(Map<String, Object> node, String targetRouteId) {
        return children(node).stream()
                .filter(c -> targetRouteId.equals(c.get("target_route_id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("缺少 target_route_id=" + targetRouteId + " 的分支"));
    }

    private static void assertBranchKeysPresent(Map<String, Object> branch) {
        for (String key : BRANCH_KEYS) {
            assertTrue(branch.containsKey(key), "分支节点缺契约字段: " + key);
        }
    }

    private static void assertRootKeysPresent(Map<String, Object> root) {
        for (String key : ROOT_KEYS) {
            assertTrue(root.containsKey(key), "根节点缺契约字段: " + key);
        }
    }

    /** 深度优先收集全部分支节点（若实现缺失防环，本方法自身会 StackOverflow 使用例失败）。 */
    private static void collectBranches(Map<String, Object> node, List<Map<String, Object>> out) {
        for (Map<String, Object> kid : children(node)) {
            out.add(kid);
            collectBranches(kid, out);
        }
    }

    // ==================== T1 单层 WEIGHT 20/80 ====================

    /** T1：WEIGHT 20/80 → 两分支 weight=20/80、hit_ratio=0.2/0.8、totals/source 根字段全量断言；
     *  未被边指向的路由（id=7）与别的路由的条件（routeId=98）不得混入。 */
    @Test
    void weightedBranchesExposeWeightHitRatioAndTotals() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "gw-root", "DISPATCH", "/api/gw", "http://gw-up:8080", "PUBLISHED"),
                route(2L, "pay-a", "BACKEND", "/api/pay", "http://pay-a:8080", "PUBLISHED"),
                route(3L, "pay-b", "BACKEND", "/api/refund", "http://pay-b:8080", "PUBLISHED"),
                route(7L, "lonely", "BACKEND", "/api/lonely", "http://lonely:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(11L, 1L, 2L, "WEIGHT", null, "20", null, 0),
                cond(12L, 1L, 3L, "WEIGHT", null, "80", null, 10),
                cond(99L, 98L, 2L, "HEADER", "EQ", "X-Other", "y", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 500L, 2.5d, 88.0d, PROMETHEUS),
                summaryRow(2L, 100L, 2.0d, 45.5d, PROMETHEUS),
                summaryRow(3L, 400L, 8.0d, 120.0d, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);

        // ---- 根字段 ----
        assertRootKeysPresent(root);
        assertEquals("1", root.get("route_id"), "id 一律 String.valueOf 防 JS 精度丢失");
        assertEquals("gw-root", root.get("route_name"));
        assertEquals("DISPATCH", root.get("route_type"));
        assertEquals("/api/gw", root.get("path"));
        assertEquals("http://gw-up:8080", root.get("upstream_url"));
        assertEquals("PUBLISHED", root.get("status"));
        assertEquals("prod", root.get("environment"));
        assertEquals(5, ((Number) root.get("max_depth")).intValue(), "max_depth 恒为 5");
        assertEquals(PROMETHEUS, root.get("source"), "source 透传 summary() 行内 source");
        assertInstanceOf(Long.class, totals(root).get("hits_24h"), "totals.hits_24h 为 long");
        assertEquals(500L, totals(root).get("hits_24h"));
        assertInstanceOf(Double.class, totals(root).get("qps"), "totals.qps 为 double");
        assertEquals(2.5, (Double) totals(root).get("qps"), 1e-9);

        // ---- children 只按条件边生成：2 个分支、priority 升序 ----
        List<Map<String, Object>> kids = children(root);
        assertEquals(2, kids.size(), "children 只按「边的 target」生成（未指向的 7 号与噪声条件 98→2 不得出现）");
        assertEquals("2", kids.get(0).get("target_route_id"), "priority 升序：priority 0 在前");
        assertEquals("3", kids.get(1).get("target_route_id"), "priority 升序：priority 10 在后");

        // ---- 分支 A（weight 20）----
        Map<String, Object> a = branch(root, "2");
        assertBranchKeysPresent(a);
        assertEquals("pay-a", a.get("target_route_name"));
        assertEquals("BACKEND", a.get("target_route_type"));
        assertEquals("/api/pay", a.get("target_path"));
        assertEquals("http://pay-a:8080", a.get("target_upstream_url"));
        assertEquals(Boolean.TRUE, a.get("target_resolvable"), "目标存在且 PUBLISHED → 可解析");
        assertEquals(Boolean.FALSE, a.get("is_nested"), "BACKEND 目标非 DISPATCH");
        assertEquals(0, ((Integer) a.get("priority")).intValue());
        assertInstanceOf(Integer.class, a.get("weight"), "weight 为 Integer");
        assertEquals(20, a.get("weight"));
        assertInstanceOf(Map.class, condition(a));
        assertEquals("WEIGHT", condition(a).get("condition_type"));
        assertNull(condition(a).get("operator"), "fixture 的 operator=null 应原样透传");
        assertEquals("20", condition(a).get("condition_key"));
        assertNull(condition(a).get("condition_value"), "fixture 的 condition_value=null 应原样透传");
        assertInstanceOf(Long.class, a.get("hits_24h"), "hits_24h 为 Long");
        assertEquals(100L, a.get("hits_24h"));
        assertInstanceOf(Double.class, a.get("qps"), "qps 为 Double");
        assertEquals(2.0, (Double) a.get("qps"), 1e-9);
        assertEquals(45.5, (Double) a.get("p95_latency_ms"), 1e-9);
        assertInstanceOf(Double.class, a.get("hit_ratio"), "hit_ratio 为 double");
        assertEquals(0.2, (Double) a.get("hit_ratio"), 1e-9, "100/(100+400)=0.2");
        assertTrue(children(a).isEmpty(), "BACKEND 叶子 children 为空数组");

        // ---- 分支 B（weight 80）----
        Map<String, Object> b = branch(root, "3");
        assertEquals(80, b.get("weight"));
        assertEquals(400L, b.get("hits_24h"));
        assertEquals(8.0, (Double) b.get("qps"), 1e-9);
        assertEquals(120.0, (Double) b.get("p95_latency_ms"), 1e-9);
        assertEquals(0.8, (Double) b.get("hit_ratio"), 1e-9, "400/(100+400)=0.8");
    }

    // ==================== T2 混合条件 ====================

    /** T2：非 WEIGHT（HEADER EQ）priority 0 小于 WEIGHT priority 10 → priority 升序；
     *  HEADER 边 condition 四元组逐字段断言、weight=null；WEIGHT 边照常列出且 weight 解析为 30。 */
    @Test
    void mixedConditionsOrderByPriorityWithFourTupleCondition() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "gw-gray", "DISPATCH", "/api/gray", null, "PUBLISHED"),
                route(4L, "gray-canary", "BACKEND", "/api/canary", "http://canary:8080", "PUBLISHED"),
                route(5L, "gray-stable", "BACKEND", "/api/stable", "http://stable:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(21L, 1L, 5L, "WEIGHT", null, "30", null, 10),
                cond(20L, 1L, 4L, "HEADER", "EQ", "X-Version", "v2", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS),
                summaryRow(4L, 60L, 1.2d, 30.0d, PROMETHEUS),
                summaryRow(5L, 40L, 0.8d, 25.0d, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);
        List<Map<String, Object>> kids = children(root);

        assertEquals(2, kids.size(), "WEIGHT 边照常列出（不因存在非 WEIGHT 条件被剔除）");
        assertEquals("4", kids.get(0).get("target_route_id"), "priority 升序：HEADER(priority 0) 在 WEIGHT(priority 10) 之前");
        assertEquals("5", kids.get(1).get("target_route_id"));

        Map<String, Object> header = kids.get(0);
        Map<String, Object> headerCond = condition(header);
        assertEquals("HEADER", headerCond.get("condition_type"));
        assertEquals("EQ", headerCond.get("operator"));
        assertEquals("X-Version", headerCond.get("condition_key"));
        assertEquals("v2", headerCond.get("condition_value"), "condition 四元组逐字段固化");
        assertEquals(0, ((Integer) header.get("priority")).intValue());
        assertNull(header.get("weight"), "非 WEIGHT 边 weight 一律 null");
        assertEquals(60L, header.get("hits_24h"));
        assertEquals(0.6, (Double) header.get("hit_ratio"), 1e-9, "ratio 分母=本层 Σ分支 hits=100");

        Map<String, Object> weight = kids.get(1);
        assertEquals(30, weight.get("weight"), "WEIGHT 边 condition_key=30 → weight=30");
        assertEquals(10, ((Integer) weight.get("priority")).intValue());
        assertEquals("WEIGHT", condition(weight).get("condition_type"));
        assertEquals("30", condition(weight).get("condition_key"));
        assertEquals(0.4, (Double) weight.get("hit_ratio"), 1e-9);
    }

    /** T2b（规则固化）：同一 target 多条条件 → 每条条件一个 BranchNode，priority 升序、
     *  各分支携带各自 condition。 */
    @Test
    void sameTargetMultipleConditionsProduceOneBranchEach() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "gw-multi", "DISPATCH", "/api/multi", null, "PUBLISHED"),
                route(4L, "dup-target", "BACKEND", "/api/dup", "http://dup:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(31L, 1L, 4L, "QUERY", "EQ", "region", "cn", 5),
                cond(30L, 1L, 4L, "HEADER", "EQ", "X-Tag", "alpha", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS),
                summaryRow(4L, 100L, 2d, 10.0d, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);
        List<Map<String, Object>> kids = children(root);

        assertEquals(2, kids.size(), "同一 target 的两条条件各出一个 BranchNode（不合并）");
        assertEquals("4", kids.get(0).get("target_route_id"));
        assertEquals("4", kids.get(1).get("target_route_id"));
        assertEquals(0, ((Integer) kids.get(0).get("priority")).intValue(), "priority 升序");
        assertEquals(5, ((Integer) kids.get(1).get("priority")).intValue(), "priority 升序");
        assertEquals("HEADER", condition(kids.get(0)).get("condition_type"), "各分支携带各自 condition");
        assertEquals("QUERY", condition(kids.get(1)).get("condition_type"), "各分支携带各自 condition");
        // 两条边指向同一路由：hit_ratio 各按本层 Σ分支 hits=100+100 计算
        assertEquals(0.5, (Double) kids.get(0).get("hit_ratio"), 1e-9);
        assertEquals(0.5, (Double) kids.get(1).get("hit_ratio"), 1e-9);
    }

    // ==================== T3 非法权重 ====================

    /** T3：WEIGHT "0"/"abc"/blank/"-5"/"20.5" 均按 admin 显示层口径无效（引擎侧 long 全域有效） → weight=null
     *  且分支照常输出、不崩。 */
    @Test
    void invalidWeightsBecomeNullWithoutBreaking() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "gw-badw", "DISPATCH", "/api/badw", null, "PUBLISHED"),
                route(2L, "b0", "BACKEND", "/api/b0", "http://b0:8080", "PUBLISHED"),
                route(3L, "babc", "BACKEND", "/api/babc", "http://babc:8080", "PUBLISHED"),
                route(4L, "bblank", "BACKEND", "/api/bblank", "http://bblank:8080", "PUBLISHED"),
                route(5L, "bneg", "BACKEND", "/api/bneg", "http://bneg:8080", "PUBLISHED"),
                route(6L, "bdec", "BACKEND", "/api/bdec", "http://bdec:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(41L, 1L, 2L, "WEIGHT", null, "0", null, 0),
                cond(42L, 1L, 3L, "WEIGHT", null, "abc", null, 10),
                cond(43L, 1L, 4L, "WEIGHT", null, "   ", null, 20),
                cond(44L, 1L, 5L, "WEIGHT", null, "-5", null, 30),
                cond(45L, 1L, 6L, "WEIGHT", null, "20.5", null, 40)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = assertDoesNotThrow(() -> service.decisionTree(1L),
                "非法权重不得导致异常");

        List<Map<String, Object>> kids = children(root);
        assertEquals(5, kids.size(), "权重非法只作废 weight，不剔除分支");
        for (Map<String, Object> kid : kids) {
            assertNull(kid.get("weight"),
                    "condition_key=" + condition(kid).get("condition_key") + " 非法 → weight=null");
            assertNull(kid.get("hits_24h"), "summary 无行 → 指标 null");
            assertNull(kid.get("qps"));
            assertNull(kid.get("p95_latency_ms"));
            assertEquals(0.0, (Double) kid.get("hit_ratio"), 1e-9, "Σ分支 hits=0 → 全 0.0 不除零");
        }
    }

    // ==================== T4 嵌套与深度 ====================

    /** T4a：3 层 DISPATCH 嵌套 → children 逐层递归；is_nested/嵌套层 hit_ratio 正确。 */
    @Test
    void nestedThreeLevelDispatchRecursesChildren() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "d1", "DISPATCH", "/api/d1", null, "PUBLISHED"),
                route(2L, "d2", "DISPATCH", "/api/d2", null, "PUBLISHED"),
                route(3L, "d3", "DISPATCH", "/api/d3", null, "PUBLISHED"),
                route(4L, "leaf", "BACKEND", "/api/leaf", "http://leaf:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(51L, 1L, 2L, "HEADER", "EQ", "X-L1", "a", 0),
                cond(52L, 2L, 3L, "QUERY", "EQ", "region", "cn", 0),
                cond(53L, 3L, 4L, "HEADER", "EQ", "X-L3", "c", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 1000L, 10d, 90.0d, PROMETHEUS),
                summaryRow(2L, 600L, 6d, 70.0d, PROMETHEUS),
                summaryRow(3L, 300L, 3d, 50.0d, PROMETHEUS),
                summaryRow(4L, 300L, 3d, 40.0d, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);

        Map<String, Object> l2 = branch(root, "2");
        assertEquals(Boolean.TRUE, l2.get("is_nested"), "DISPATCH 目标 is_nested=true");
        assertEquals("/api/d2", l2.get("target_path"));
        assertNull(l2.get("target_upstream_url"), "DISPATCH 路由 upstream_url=null 透传");
        assertEquals(600L, l2.get("hits_24h"));
        assertEquals(1.0, (Double) l2.get("hit_ratio"), 1e-9, "本层 Σ分支 hits=600");

        Map<String, Object> l3 = branch(l2, "3");
        assertEquals(Boolean.TRUE, l3.get("is_nested"));
        assertEquals("QUERY", condition(l3).get("condition_type"), "嵌套边的 condition 取自边自身（routeId=2 的条件）");
        assertEquals("region", condition(l3).get("condition_key"));
        assertEquals(300L, l3.get("hits_24h"));
        assertEquals(1.0, (Double) l3.get("hit_ratio"), 1e-9, "嵌套层 ratio 分母=该层 Σ分支 hits=300");

        Map<String, Object> l4 = branch(l3, "4");
        assertEquals(Boolean.FALSE, l4.get("is_nested"), "第 3 层嵌套的终点 BACKEND");
        assertTrue(children(l4).isEmpty(), "BACKEND 叶子不再下钻");
        assertEquals("c", condition(l4).get("condition_value"));
    }

    /** T4b：构造 5 层 DISPATCH 链不炸；第 5 层的分支只能是终点 BACKEND（不再出现 DISPATCH）。 */
    @Test
    void fiveLevelChainTerminatesWithoutExploding() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "c1", "DISPATCH", "/api/c1", null, "PUBLISHED"),
                route(2L, "c2", "DISPATCH", "/api/c2", null, "PUBLISHED"),
                route(3L, "c3", "DISPATCH", "/api/c3", null, "PUBLISHED"),
                route(4L, "c4", "DISPATCH", "/api/c4", null, "PUBLISHED"),
                route(5L, "c5", "DISPATCH", "/api/c5", null, "PUBLISHED"),
                route(6L, "c-end", "BACKEND", "/api/c-end", "http://end:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(61L, 1L, 2L, "HEADER", "EQ", "X-L1", "a", 0),
                cond(62L, 2L, 3L, "HEADER", "EQ", "X-L2", "b", 0),
                cond(63L, 3L, 4L, "HEADER", "EQ", "X-L3", "c", 0),
                cond(64L, 4L, 5L, "HEADER", "EQ", "X-L4", "d", 0),
                cond(65L, 5L, 6L, "HEADER", "EQ", "X-L5", "e", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = assertDoesNotThrow(() -> service.decisionTree(1L), "5 层不炸");

        Map<String, Object> cur = root;
        for (String id : new String[]{"2", "3", "4", "5"}) {
            cur = branch(cur, id);
        }
        assertEquals("5", cur.get("target_route_id"), "链路钻到第 5 层 DISPATCH");
        assertEquals(Boolean.TRUE, cur.get("is_nested"));
        for (Map<String, Object> kid : children(cur)) {
            assertEquals("6", kid.get("target_route_id"),
                    "第 5 层的分支只能是终点 BACKEND（深≤5，不得出现第 6 层 DISPATCH）");
            assertEquals(Boolean.FALSE, kid.get("is_nested"));
        }
    }

    /** T4c（规则固化）：A→B→A 成环 → visited 防环，递归终止且回边节点不得再下钻。 */
    @Test
    void cycleGuardTerminatesRecursion() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "loop-a", "DISPATCH", "/api/loop-a", null, "PUBLISHED"),
                route(2L, "loop-b", "DISPATCH", "/api/loop-b", null, "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(71L, 1L, 2L, "HEADER", "EQ", "X-A", "a", 0),
                cond(72L, 2L, 1L, "HEADER", "EQ", "X-B", "b", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS),
                summaryRow(2L, 0L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = assertDoesNotThrow(() -> service.decisionTree(1L),
                "成环必须被防环逻辑终止（无防环实现在此处 StackOverflow）");

        List<Map<String, Object>> all = new ArrayList<>();
        assertDoesNotThrow(() -> collectBranches(root, all), "树必须有限（visited 防环）");
        assertTrue(all.size() <= 2, "防环后分支节点数有界（2 条边 + 至多一个根回边节点）");
        for (Map<String, Object> node : all) {
            if ("1".equals(node.get("target_route_id"))) {
                assertTrue(children(node).isEmpty(), "再现根路由的回边节点不得继续下钻");
            }
        }
    }

    // ==================== T5 目标不可解析 ====================

    /** T5a：目标路由不存在 → target_resolvable=false、target_* 元数据 null、summary 无行 → 指标 null。 */
    @Test
    void missingTargetIsUnresolvableWithNullMetrics() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "dangling", "DISPATCH", "/api/dangling", null, "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(81L, 1L, 9L, "HEADER", "EQ", "X-Ghost", "g", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 10L, 0.1d, 5.0d, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);
        Map<String, Object> ghost = branch(root, "9");

        assertEquals("9", ghost.get("target_route_id"));
        assertNull(ghost.get("target_route_name"), "目标不存在 → 元数据 null");
        assertNull(ghost.get("target_route_type"));
        assertNull(ghost.get("target_path"));
        assertNull(ghost.get("target_upstream_url"));
        assertEquals(Boolean.FALSE, ghost.get("target_resolvable"), "目标不存在 → 不可解析");
        assertEquals(Boolean.FALSE, ghost.get("is_nested"), "目标不存在 → 非 DISPATCH");
        assertNull(ghost.get("hits_24h"), "summary 无此行 → hits_24h=null");
        assertNull(ghost.get("qps"), "summary 无此行 → qps=null");
        assertNull(ghost.get("p95_latency_ms"));
        assertEquals(0.0, (Double) ghost.get("hit_ratio"), 1e-9, "本层 Σ分支 hits=0 → 0.0");
        assertTrue(children(ghost).isEmpty());
    }

    /** T5b（规则正交性固化）：OFFLINE 目标 → target_resolvable=false，但 summary 有行 →
     *  指标照常输出（resolvable 只看 status==PUBLISHED，与指标 join 互不影响）。 */
    @Test
    void offlineTargetUnresolvableButKeepsSummaryMetrics() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "dim", "DISPATCH", "/api/dim", null, "PUBLISHED"),
                route(2L, "dark", "BACKEND", "/api/dark", "http://dark:8080", "OFFLINE")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(82L, 1L, 2L, "HEADER", "EQ", "X-Dark", "d", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 50L, 0.5d, 8.0d, PROMETHEUS),
                summaryRow(2L, 70L, 2.0d, null, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);
        Map<String, Object> offline = branch(root, "2");

        assertEquals(Boolean.FALSE, offline.get("target_resolvable"), "OFFLINE → 不可解析（include_unpublished 展示语义）");
        assertEquals(Boolean.FALSE, offline.get("is_nested"));
        assertEquals("dark", offline.get("target_route_name"));
        assertEquals(70L, offline.get("hits_24h"), "summary 有行 → 指标照常（不受 status 影响）");
        assertEquals(2.0, (Double) offline.get("qps"), 1e-9);
        assertNull(offline.get("p95_latency_ms"), "行内 p95=null 透传");
        assertEquals(1.0, (Double) offline.get("hit_ratio"), 1e-9,
                "ratio 分母=本层 Σ分支 hits=70（根自身 hits 不计入子层分母）→ 70/70");
    }

    // ==================== T6 BACKEND 叶子 ====================

    /** T6：被指向的 BACKEND 叶子 is_nested=false、children 为空数组（不得 null、不得再嵌套）。 */
    @Test
    void backendLeafBranchHasEmptyChildrenAndIsNotNested() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "single", "DISPATCH", "/api/single", null, "PUBLISHED"),
                route(2L, "sink", "BACKEND", "/api/sink", "http://sink:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(83L, 1L, 2L, "HEADER", "EQ", "X-Only", "o", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 1L, 0d, null, PROMETHEUS),
                summaryRow(2L, 1L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);

        assertEquals(1, children(root).size(), "BACKEND 叶子只以「边的 target」身份出现一次");
        Map<String, Object> leaf = branch(root, "2");
        assertEquals(Boolean.FALSE, leaf.get("is_nested"), "BACKEND 叶子 is_nested=false");
        assertNotNull(leaf.get("children"), "children 键必须存在（空数组而非 null）");
        assertTrue(children(leaf).isEmpty(), "BACKEND 叶子无子层（空数组）");
        assertEquals("http://sink:8080", leaf.get("target_upstream_url"));
    }

    // ==================== T7 路由不存在 ====================

    /** T7：routeId 不存在 → BusinessException 且错误码 = ErrorCode.ROUTE_NOT_FOUND(10601)。 */
    @Test
    void unknownRouteIdThrowsRouteNotFound() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(5L, "other", "BACKEND", "/api/other", "http://other:8080", "PUBLISHED")));

        BusinessException e = assertThrows(BusinessException.class, () -> service.decisionTree(1L),
                "routeId 不存在必须抛业务异常");

        assertEquals(ErrorCode.ROUTE_NOT_FOUND, e.getErrorCode(), "错误码枚举必须为 ROUTE_NOT_FOUND");
        assertEquals(ErrorCode.ROUTE_NOT_FOUND.code(), e.getCode(), "码值 10601");
    }

    // ==================== T8 source 透传 ====================

    /** T8：summary() 返回 source=snapshot → 根 source=snapshot（降级态透传），指标照常 join。 */
    @Test
    void snapshotSourcePassesThroughToRoot() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "snap-root", "DISPATCH", "/api/snap", null, "PUBLISHED"),
                route(2L, "snap-leaf", "BACKEND", "/api/snap-leaf", "http://snap:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(84L, 1L, 2L, "HEADER", "EQ", "X-Snap", "s", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 8L, 0d, null, "snapshot"),
                summaryRow(2L, 3L, 0d, null, "snapshot")));

        Map<String, Object> root = service.decisionTree(1L);

        assertEquals("snapshot", root.get("source"), "source 透传 summary() 的 source");
        assertEquals(8L, totals(root).get("hits_24h"));
        assertEquals(0.0, (Double) totals(root).get("qps"), 1e-9);
        assertEquals(3L, branch(root, "2").get("hits_24h"), "snapshot 行照常按 route_id join");
    }

    // ==================== T9 N+1 防护 ====================

    /** T9：查询铁律——3 层嵌套场景下 routeMapper/conditionMapper 各恰好 1 次、summary() 恰好 1 次
     *  （严禁逐节点 listChildren / 逐节点查条件 / 逐节点取指标）。 */
    @Test
    void threeQueriesTotalRegardlessOfTreeDepth() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "n1", "DISPATCH", "/api/n1", null, "PUBLISHED"),
                route(2L, "n2", "DISPATCH", "/api/n2", null, "PUBLISHED"),
                route(3L, "n3", "DISPATCH", "/api/n3", null, "PUBLISHED"),
                route(4L, "n4", "BACKEND", "/api/n4", "http://n4:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(91L, 1L, 2L, "HEADER", "EQ", "X-N1", "a", 0),
                cond(92L, 2L, 3L, "QUERY", "EQ", "region", "cn", 0),
                cond(93L, 3L, 4L, "HEADER", "EQ", "X-N3", "c", 0)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 1L, 0d, null, PROMETHEUS),
                summaryRow(2L, 1L, 0d, null, PROMETHEUS),
                summaryRow(3L, 1L, 0d, null, PROMETHEUS),
                summaryRow(4L, 1L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = service.decisionTree(1L);
        branch(branch(branch(root, "2"), "3"), "4");

        verify(routeMapper, times(1)).selectList(any());
        verify(conditionMapper, times(1)).selectList(any());
        verify(trafficSummaryService, times(1)).summary();
    }

    // ==================== T10 Σ=0 不除零 ====================

    /** T10：本层 Σ分支 hits_24h=0（一行 hits=0、一行无 summary 行）→ hit_ratio 全 0.0，不除零。 */
    @Test
    void zeroTotalHitsYieldsZeroRatios() {
        when(routeMapper.selectList(any())).thenReturn(List.of(
                route(1L, "zero", "DISPATCH", "/api/zero", null, "PUBLISHED"),
                route(2L, "z-a", "BACKEND", "/api/z-a", "http://za:8080", "PUBLISHED"),
                route(3L, "z-b", "BACKEND", "/api/z-b", "http://zb:8080", "PUBLISHED")));
        when(conditionMapper.selectList(any())).thenReturn(List.of(
                cond(94L, 1L, 2L, "HEADER", "EQ", "X-ZA", "a", 0),
                cond(95L, 1L, 3L, "HEADER", "EQ", "X-ZB", "b", 10)));
        when(trafficSummaryService.summary()).thenReturn(List.of(
                summaryRow(1L, 0L, 0d, null, PROMETHEUS),
                summaryRow(2L, 0L, 0d, null, PROMETHEUS)));

        Map<String, Object> root = assertDoesNotThrow(() -> service.decisionTree(1L),
                "Σ=0 不得抛 ArithmeticException");

        Map<String, Object> a = branch(root, "2");
        assertEquals(0L, a.get("hits_24h"), "summary 有行且 hits=0 → 0（非 null）");
        assertEquals(0.0, (Double) a.get("hit_ratio"), 1e-9, "0/0 → 0.0");
        Map<String, Object> b = branch(root, "3");
        assertNull(b.get("hits_24h"), "summary 无行 → null");
        assertEquals(0.0, (Double) b.get("hit_ratio"), 1e-9, "null 按 0 计入分母 → 0/0 → 0.0");
    }
}
