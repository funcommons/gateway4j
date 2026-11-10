package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.common.mapper.RouteConditionMapper;
import fun.commons.gateway4j.common.mapper.RouteMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.route.validator.RouteValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * S7-5 T 步（RED）：路由列表 keyword 服务端搜索契约（消 ⌘K 面板 listRoutes() 全量拉带宽，
 * P3 池遗留④）。纯增量：不改业务代码、不动 RouteServiceTest / RouteController*Test 存量用例。
 *
 * <p><b>契约裁决（固化，C 步不得偏离）：keyword 非空 → 平铺命中列表；keyword 空/缺失 → 原树全量。</b></p>
 *
 * <p>候选两案：①「命中行 + 祖先链保树」——需命中集回溯 parentRouteId 重组树、父行因子
 * 命中带出，实现重；②「平铺命中列表」——keyword 分支跳过树装配，命中行直接铺开
 * （children=[]，节点 schema 与树模式完全一致）。<b>择②固化</b>，理由：
 * <ul>
 *   <li>实现最小：一条 if 分支 + 内存 contains 过滤，复用 toTreeNode（childrenMap 置空），
 *       无祖先回溯/重组/排序逻辑；</li>
 *   <li>唯一消费方 ⌘K 面板（useCommandRegistry）本就 flattenRoutes 拍平，树形信息零价值，
 *       平铺还免去前端拍平一趟；</li>
 *   <li>带宽语义纯粹：响应体 = 恰好命中行，无父行因子命中而带出的额外体积；</li>
 *   <li>顺带修复既有缺陷：现实现 keyword 经 {@code listRoutes} 下推 SQL LIKE(route_name)
 *       后树装配照旧——子行命中而父行不命中时，子行挂进 childrenMap 却因父不在结果集
 *       （非 root）永不渲染，<b>命中子路由被静默丢弃</b>；平铺契约下该行可见；</li>
 *   <li>零存量影响：全仓核查 listRoutes 生产调用方（List/Detail/Chain/Debug/ImportExport/
 *       Publish/RouteEditForm）全部无参调用（树契约不变），仅 ⌘K 面板将改传 keyword。</li>
 * </ul></p>
 *
 * <p><b>搜索域 = route_name OR path</b>（前端 useCommandRegistry 客户端过滤域同口径：
 * matches(`${route_name} ${path}`)），大小写语义不在此钉死（现 SQL LIKE 于 PG 大小写敏感，
 * 前端兜底过滤保留后大小写差异由客户端消化，C 步可自由选择 like/ilike/内存忽略大小写）。</p>
 *
 * <p><b>「2 查询封顶」语义（实施契约.md S7a 铁律，本票的真实含义）</b>：keyword 过滤
 * <b>不下推 SQL LIKE</b>——listRouteTree 对内改传 keyword=null 全量拉取后<b>内存过滤</b>。
 * 因此「省带宽」= <b>HTTP 响应体变小</b>（只回命中行），<b>不是查询变少</b>：DB 侧查询数
 * 与 keyword 空时完全一致（routes 全量 ×1 + bindings ×1 语义封顶；现实现的
 * bindingMapper.selectList(null) 二连调是既有小瑕疵，不在本票扩差）。
 * N+1 防护钉法跟随 S7a 先例：{@code verify(routeMapper, times(1)).selectList(any())}。</p>
 *
 * <p><b>RED 机制（行为缺失型，非 404 型——controller 端点与 keyword 形参均已存在，
 * 见 RouteController.listRoutes L93-99）</b>：mapper mock 按夹具全量返回（无视 wrapper），
 * 今日 listRouteTree 无内存过滤 → 检索词「无命中→空列表」「仅子命中→仅子行」「path 命中
 * →返回」「平铺 children=[]」四类断言全部失败；keyword 空 → 原树全量与查询封顶两类
 * 为守卫钉（今日已绿，防 C 步回归）。</p>
 *
 * <p><b>给 C 步的实现要点（由本文件断言倒逼）</b>：
 * ① listRouteTree 内 {@code listRoutes(routeType, status, null, tag, environment)}——
 * keyword 不再下推 SQL（否则 path 命中在真实 DB 依旧漏，mock 单测探不到、集成环境必红）；
 * ② keyword 非空（null/"" 均视为未提供）→ {@code all} 内存过滤
 * {@code name.contains(kw) || (path != null && path.contains(kw))} → 逐行
 * {@code toTreeNode(r, Map.of(), bindingsByRoute, pluginMap)} 平铺返回（children 恒=[]）；
 * ③ keyword 空分支树装配逻辑零改动（RouteControllerParamBindingTest 与本文件用例 5 双向钉）。</p>
 *
 * <p><b>模式引用</b>：TableInfoHelper.initTableInfo 手动注册 + setBaseMapper 反射注入 +
 * 纯 JUnit5+Mockito，跟随 {@link RouteServiceTest}（S7a 裁决⑦点名的先例）。</p>
 */
class RouteServiceKeywordSearchTest {

    @Mock private RouteMapper routeMapper;
    @Mock private RouteConditionMapper conditionMapper;
    @Mock private RoutePluginBindingMapper bindingMapper;
    @Mock private RouteValidator routeValidator;
    @Mock private PluginService pluginService;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private RouteVersionService routeVersionService;

    private RouteService routeService;

    private Route dispatchParent;
    private Route payChild;
    private Route pathOnlyHit;

    @BeforeEach
    void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        routeService = new RouteService(conditionMapper, bindingMapper, routeValidator, pluginService,
                eventPublisher, routeVersionService);
        setBaseMapper(routeService, routeMapper);

        // 纯单测无 MyBatis-Plus 启动流程：手动注册 Route 的 TableInfo（RouteServiceTest 同款，
        // 否则 LambdaQueryWrapper 解析 Route::getSortOrder 报 can not find lambda cache）
        if (com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(Route.class) == null) {
            com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                    new org.apache.ibatis.builder.MapperBuilderAssistant(
                            new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                    Route.class);
        }

        dispatchParent = Route.builder()
                .id(1L).routeName("dispatch-root").routeType("DISPATCH")
                .parentRouteId(null).sortOrder(1).status("PUBLISHED").build();
        payChild = Route.builder()
                .id(2L).routeName("pay-child").routeType("BACKEND")
                .path("/api/pay/**")
                .parentRouteId(1L).sortOrder(1).status("PUBLISHED").build();
        // 检索词只命中 path、不命中 name 的行（前端搜索域含 path 的服务端对位）
        pathOnlyHit = Route.builder()
                .id(3L).routeName("orders-api").routeType("BACKEND")
                .path("/api/pay/refund/**")
                .parentRouteId(null).sortOrder(2).status("PUBLISHED").build();
    }

    private void setBaseMapper(Object service, Object mapper) throws Exception {
        Field field = findField(service.getClass(), "baseMapper");
        field.setAccessible(true);
        field.set(service, mapper);
    }

    private Field findField(Class<?> clazz, String name) {
        for (Class<?> c = clazz; c != null; c = c.getSuperclass()) {
            try { return c.getDeclaredField(name); } catch (NoSuchFieldException e) { /* continue */ }
        }
        throw new RuntimeException("Field not found: " + name);
    }

    /** stub 全量返回三行（mock 无视 wrapper——正是 RED 机关：今日服务层无内存过滤）。 */
    private void stubAllRoutes() {
        when(routeMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(dispatchParent, payChild, pathOnlyHit));
    }

    // ==================== 1. RED：keyword 非空 → 平铺命中列表 ====================

    /** name 命中：仅命中行返回，且为平铺节点（children 恒=[]，节点 schema 与树模式一致）。 */
    @Test
    void keywordMatchesNameReturnsFlatHitRowsOnly() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "pay-child", null, null);

        assertEquals(1, result.size(), "keyword 非空应只回命中行（今日无内存过滤 → mock 全量组装成树两根，RED）");
        assertEquals("2", result.get(0).get("id"));
        assertEquals("pay-child", result.get(0).get("route_name"));
        assertEquals(List.of(), result.get(0).get("children"), "平铺契约：命中行 children 恒为空数组");
    }

    /** path 命中（name 不含检索词）：搜索域 = route_name OR path。 */
    @Test
    void keywordMatchesPathReturnsHitRow() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "pay/refund", null, null);

        assertEquals(1, result.size(), "path 命中行应返回（今日搜索域仅 route_name 且无内存过滤，RED）");
        assertEquals("3", result.get(0).get("id"));
        assertEquals("orders-api", result.get(0).get("route_name"));
    }

    /** 子行命中而父行不命中：子行必须出现在响应中（修复「命中子路由被静默丢弃」既有缺陷）。 */
    @Test
    void keywordHitsChildWithoutParentStillReturned() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "pay-child", null, null);

        // 今日：无内存过滤 → 全量树（父 root + 子嵌套）→ size=1 断言失败（RED）
        assertEquals(1, result.size(), "仅子行命中 → 平铺单行（父不命中不回）");
        assertEquals("2", result.get(0).get("id"), "命中的子路由不得因父未命中而静默丢弃");
    }

    /** 无命中 → 空列表（今日 mock 全量返回 + 无内存过滤 → 三行，RED）。 */
    @Test
    void keywordNoMatchReturnsEmptyList() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "no-such-keyword", null, null);

        assertTrue(result.isEmpty(), "keyword 无命中应返回空数组（响应体省带宽的下限形态）");
    }

    /** 平铺命中行保留 plugins 汇总（节点 schema 与树模式一致：⌘K 无消费但 schema 不开叉）。 */
    @Test
    void keywordFlatRowsKeepPluginsSummary() {
        stubAllRoutes();
        RoutePluginBinding binding = new RoutePluginBinding();
        binding.setRouteId(2L);
        binding.setPluginId(7L);
        binding.setSortOrder(1);
        when(bindingMapper.selectList(any())).thenReturn(List.of(binding));
        Plugin plugin = new Plugin();
        plugin.setId(7L);
        plugin.setPluginName("jwt-auth");
        plugin.setPluginPhase("GLOBAL_PRE");
        when(pluginService.listByIds(any())).thenReturn(List.of(plugin));

        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "pay-child", null, null);

        assertEquals(1, result.size());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> plugins = (List<Map<String, Object>>) result.get(0).get("plugins");
        assertEquals(1, plugins.size(), "平铺行 plugins 汇总不得丢");
        assertEquals("jwt-auth", plugins.get(0).get("plugin_name"));
    }

    // ==================== 2. 守卫：keyword 空/缺失 → 原树全量 ====================

    /** keyword=null：嵌套树原样（夹具两根：dispatch-root 含嵌套子 pay-child；orders-api 独立根），
     * 树装配逻辑零改动。 */
    @Test
    void nullKeywordReturnsFullTree() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, null, null, null);

        assertEquals(2, result.size(), "无 keyword → 树全量：两根均在");
        Map<String, Object> dispatchRoot = result.stream()
                .filter(n -> "1".equals(n.get("id"))).findFirst().orElseThrow();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> children = (List<Map<String, Object>>) dispatchRoot.get("children");
        assertEquals(1, children.size(), "树契约：子路由嵌套在 children");
        assertEquals("2", children.get(0).get("id"));
    }

    /** keyword 空串 = 未提供（走树分支，不进平铺分支）。 */
    @Test
    void blankKeywordReturnsFullTree() {
        stubAllRoutes();
        List<Map<String, Object>> result = routeService.listRouteTree(null, null, "", null, null);

        assertEquals(2, result.size(), "空串 = 未提供：树全量两根");
        Map<String, Object> dispatchRoot = result.stream()
                .filter(n -> "1".equals(n.get("id"))).findFirst().orElseThrow();
        assertNotNull(dispatchRoot.get("children"), "空串走树分支：children 为组装后的列表（非恒 []）");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> children = (List<Map<String, Object>>) dispatchRoot.get("children");
        assertEquals(1, children.size());
    }

    // ==================== 3. 守卫：查询封顶（S7a 铁律） ====================

    /** keyword 非空查询数与基线一致：routes 全量恰 1 次（N+1 防护，S7a 先例钉法）——
     * 「省带宽 = 响应体变小，不是查询变少」，keyword 分支不得新增任何查询。 */
    @Test
    void keywordSearchKeepsQueryCountAtBaseline() {
        stubAllRoutes();
        when(bindingMapper.selectList(any())).thenReturn(List.of());

        routeService.listRouteTree(null, null, "pay", null, null);

        verify(routeMapper, times(1)).selectList(any(LambdaQueryWrapper.class));
        verify(bindingMapper, atMost(2)).selectList(any());
        verify(pluginService, never()).list();
    }
}
