package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteVersionMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteVersion;
import fun.commons.gateway4j.common.util.JsonUtils;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 路由版本快照服务单测 —— 对应契约 §4 S5a（docs/ui-v2/实施契约.md）。
 * <p>
 * 被测类尚未实现（红是预期）。契约固定：构造器
 * {@code RouteVersionService(RouteVersionMapper, ObjectMapper)}；实体
 * {@code fun.commons.gateway4j.common.model.RouteVersion}（字段 id/routeId/configVersion/
 * changeType/snapshotData/changeDescription/actor/publishedAt）与
 * {@code fun.commons.gateway4j.common.mapper.RouteVersionMapper} 为计划包名
 * （表 gw_route_version，见 V1.5.0__route_version.sql）。
 * <p>
 * 契约决策（实现须与本文件一致）：
 * <ul>
 *   <li><b>actor 方案</b>：RouteService/Controller 现无当前用户 accessor（已核实）→
 *       actor 作为 recordSnapshot 显式参数由调用方（Controller → RouteService
 *       publish/offline/update 事务内）传入，本服务不自行取 SecurityContext。</li>
 *   <li><b>snapshot 字段口径</b>：snake_case 键序列化 route_name/route_type/path/
 *       upstream_url/status/sort_order/remark/tags（与 RouteService.toTreeNode、
 *       EnvDiff 字段名同口径），一行入 gw_route_version。</li>
 *   <li><b>diff 输出形状</b>：List&lt;Map&gt;，每行平铺 {field, from, to}；字段集与
 *       EnvDiff 相同（path/upstream_url/status/sort_order/remark，sort_order null→0、
 *       remark null→"" 归一）；未变字段不输出（沿 EnvDiff putIfChanged 惯例）。</li>
 *   <li><b>diff 取数</b>：单次 mapper.selectList（route_id + config_version 命中
 *       from/to），按 configVersion 对齐两版本。</li>
 *   <li><b>异常语义决策表</b>（「配置写失败应阻断发布」→ 抛业务异常使事务回滚）：
 *       快照 JSON 序列化失败 → BusinessException(CONFIG_SYNC_FAILED)，不吞也不透传
 *       原始受检异常；mapper.insert 返回 0 → BusinessException(CONFIG_SYNC_FAILED)；
 *       diff 版本不存在 → BusinessException(ROUTE_NOT_FOUND)（复用现有码 10601，不新造）。</li>
 * </ul>
 */
class RouteVersionServiceTest {

    @Mock private RouteVersionMapper routeVersionMapper;
    @Mock private ObjectMapper serializationFailingMapper;

    private RouteVersionService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        // 纯单测无 MyBatis-Plus 启动流程：手动注册 RouteVersion 的 TableInfo，
        // 否则服务内 LambdaQueryWrapper 解析 RouteVersion::getRouteId 时报
        // "can not find lambda cache for this entity"（同 RouteServiceTest 先例）
        if (TableInfoHelper.getTableInfo(RouteVersion.class) == null) {
            TableInfoHelper.initTableInfo(
                    new MapperBuilderAssistant(new MybatisConfiguration(), ""), RouteVersion.class);
        }
        service = new RouteVersionService(routeVersionMapper, new ObjectMapper());
    }

    private Route route() {
        return Route.builder()
                .id(7L).routeName("pay-api").routeType("BACKEND")
                .path("/api/pay").upstreamUrl("http://pay:8080")
                .status("PUBLISHED").sortOrder(3).remark("支付入口")
                .tags("prod,pay").configVersion(4L)
                .build();
    }

    private String snapshotJson(String path, String upstream, String status, int sortOrder, String remark) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("route_name", "pay-api");
        snapshot.put("path", path);
        snapshot.put("upstream_url", upstream);
        snapshot.put("status", status);
        snapshot.put("sort_order", sortOrder);
        snapshot.put("remark", remark);
        return JsonUtils.toCompactJson(snapshot);
    }

    private Map<String, Object> row(List<Map<String, Object>> rows, String field) {
        return rows.stream().filter(r -> field.equals(r.get("field"))).findFirst().orElseThrow();
    }

    @Test
    void recordSnapshotSerializesRouteFieldsIntoVersionRow() {
        when(routeVersionMapper.insert(any(RouteVersion.class))).thenReturn(1);

        service.recordSnapshot(route(), "PUBLISH", "alice", "首次发布");

        ArgumentCaptor<RouteVersion> captor = ArgumentCaptor.forClass(RouteVersion.class);
        verify(routeVersionMapper).insert(captor.capture());
        RouteVersion saved = captor.getValue();
        assertEquals(Long.valueOf(7L), saved.getRouteId());
        assertEquals(Long.valueOf(4L), saved.getConfigVersion(), "config_version 取 route.getConfigVersion()");
        assertEquals("PUBLISH", saved.getChangeType());
        assertEquals("alice", saved.getActor());
        assertEquals("首次发布", saved.getChangeDescription());
        assertNotNull(saved.getPublishedAt());

        Map<?, ?> snapshot = JsonUtils.parseObject(saved.getSnapshotData(), Map.class);
        assertEquals("/api/pay", snapshot.get("path"));
        assertEquals("http://pay:8080", snapshot.get("upstream_url"));
        assertEquals("PUBLISHED", snapshot.get("status"));
        assertEquals(3, snapshot.get("sort_order"));
        assertEquals("支付入口", snapshot.get("remark"));
        assertEquals("pay-api", snapshot.get("route_name"));
    }

    @Test
    void recordSnapshotToleratesNullChangeDescription() {
        when(routeVersionMapper.insert(any(RouteVersion.class))).thenReturn(1);

        Route route = route();
        assertDoesNotThrow(() -> service.recordSnapshot(route, "OFFLINE", "bob", null));

        ArgumentCaptor<RouteVersion> captor = ArgumentCaptor.forClass(RouteVersion.class);
        verify(routeVersionMapper).insert(captor.capture());
        assertNull(captor.getValue().getChangeDescription(), "change_description 列存 null，不抛不兜默认串");
    }

    @Test
    void listVersionsFiltersByRouteAndOrdersConfigVersionDesc() {
        List<RouteVersion> descOrder = List.of(
                RouteVersion.builder().routeId(7L).configVersion(3L).changeType("PUBLISH").build(),
                RouteVersion.builder().routeId(7L).configVersion(2L).changeType("OFFLINE").build(),
                RouteVersion.builder().routeId(7L).configVersion(1L).changeType("PUBLISH").build());
        when(routeVersionMapper.selectList(any())).thenReturn(descOrder);

        List<RouteVersion> versions = service.listVersions(7L);

        assertEquals(List.of(3L, 2L, 1L),
                versions.stream().map(RouteVersion::getConfigVersion).toList(), "按 config_version 倒序透传");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Wrapper<RouteVersion>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(routeVersionMapper).selectList(captor.capture());
        @SuppressWarnings("unchecked")
        AbstractWrapper<RouteVersion, ?, ?> wrapper = (AbstractWrapper<RouteVersion, ?, ?>) captor.getValue();
        // MyBatis-Plus formatParam 惰性求值：先 getSqlSegment() 渲染，再断言 paramNameValuePairs
        String sql = wrapper.getSqlSegment().toUpperCase();
        assertTrue(wrapper.getParamNameValuePairs().containsValue(7L), "查询条件携带 route_id 过滤");
        assertTrue(sql.contains("CONFIG_VERSION"), "排序列为 config_version");
        assertTrue(sql.contains("DESC"), "config_version 倒序");
    }

    @Test
    void diffReportsChangedFieldsAsFieldFromToRows() {
        RouteVersion from = RouteVersion.builder().routeId(7L).configVersion(3L)
                .snapshotData(snapshotJson("/api/pay", "http://pay:8080", "PUBLISHED", 3, "支付入口"))
                .build();
        RouteVersion to = RouteVersion.builder().routeId(7L).configVersion(4L)
                .snapshotData(snapshotJson("/api/pay-v2", "http://pay:8080", "DRAFT", 3, "支付入口"))
                .build();
        when(routeVersionMapper.selectList(any())).thenReturn(List.of(from, to));

        List<Map<String, Object>> rows = service.diff(7L, 3, 4);

        assertEquals(2, rows.size(), "未变字段不输出（沿 EnvDiff putIfChanged 惯例）");
        assertEquals("/api/pay", row(rows, "path").get("from"));
        assertEquals("/api/pay-v2", row(rows, "path").get("to"));
        assertEquals("PUBLISHED", row(rows, "status").get("from"));
        assertEquals("DRAFT", row(rows, "status").get("to"));
        assertTrue(rows.stream().noneMatch(r -> "upstream_url".equals(r.get("field"))
                        || "sort_order".equals(r.get("field")) || "remark".equals(r.get("field"))),
                "未变字段不出现在 diff 输出");
    }

    @Test
    void diffMissingVersionThrowsBusinessException() {
        RouteVersion only = RouteVersion.builder().routeId(7L).configVersion(3L)
                .snapshotData(snapshotJson("/api/pay", "http://pay:8080", "PUBLISHED", 3, null))
                .build();
        when(routeVersionMapper.selectList(any())).thenReturn(List.of(only));

        assertThrows(BusinessException.class, () -> service.diff(7L, 3, 4), "to 版本缺失 → 拒绝");
        assertThrows(BusinessException.class, () -> service.diff(7L, 5, 6), "from/to 均缺失 → 拒绝");
    }

    @Test
    void snapshotSerializationFailureBlocksPublish() throws Exception {
        when(serializationFailingMapper.writeValueAsString(any()))
                .thenThrow(new JsonProcessingException("boom") {});
        RouteVersionService failing = new RouteVersionService(routeVersionMapper, serializationFailingMapper);

        assertThrows(BusinessException.class,
                () -> failing.recordSnapshot(route(), "PUBLISH", "alice", null),
                "快照序列化失败不吞 → 业务异常使发布事务回滚");
        verify(routeVersionMapper, never()).insert(any(RouteVersion.class));
    }

    @Test
    void insertWriteFailureBlocksPublish() {
        when(routeVersionMapper.insert(any(RouteVersion.class))).thenReturn(0);

        assertThrows(BusinessException.class,
                () -> service.recordSnapshot(route(), "PUBLISH", "alice", null),
                "快照行写失败（affected 0）不吞 → 业务异常使发布事务回滚");
    }

    // ==================== V-S5a 评审 P2 补测：UNIQUE 三列后共存/替换/择优语义 ====================

    /** P0 回归：下线后修改链 PUBLISH@1 → OFFLINE@2 → UPDATE@2，OFFLINE@2 与 UPDATE@2
     *  并存不撞 UNIQUE(route_id, config_version, change_type)。 */
    @Test
    void offlineThenUpdateChainWritesThreeRowsWithoutUniqueCollision() {
        when(routeVersionMapper.insert(any(RouteVersion.class))).thenReturn(1);
        when(routeVersionMapper.delete(any(Wrapper.class))).thenReturn(1);

        assertDoesNotThrow(() -> {
            service.recordSnapshot(Route.builder().id(7L).routeName("pay-api").path("/api/pay")
                            .upstreamUrl("http://pay:8080").status("PUBLISHED").configVersion(1L).build(),
                    "PUBLISH", "alice", null);
            service.recordSnapshot(Route.builder().id(7L).routeName("pay-api").path("/api/pay")
                            .upstreamUrl("http://pay:8080").status("OFFLINE").configVersion(2L).build(),
                    "OFFLINE", "alice", null);
            service.recordSnapshot(Route.builder().id(7L).routeName("pay-api").path("/api/pay-v2")
                            .upstreamUrl("http://pay:8080").status("OFFLINE").configVersion(2L).build(),
                    "UPDATE", "system", null);
        }, "三连 recordSnapshot 全程不抛（UPDATE@2 与 OFFLINE@2 并存不撞键）");
        verify(routeVersionMapper, times(3)).insert(any(RouteVersion.class));
        verify(routeVersionMapper, times(1)).delete(any(Wrapper.class));

        when(routeVersionMapper.selectList(any())).thenReturn(List.of(
                RouteVersion.builder().routeId(7L).configVersion(2L).changeType("UPDATE").build(),
                RouteVersion.builder().routeId(7L).configVersion(2L).changeType("OFFLINE").build(),
                RouteVersion.builder().routeId(7L).configVersion(1L).changeType("PUBLISH").build()));
        assertEquals(3, service.listVersions(7L).size(), "下线后修改链落 3 行（OFFLINE@2 与 UPDATE@2 并存）");
    }

    /** P0 择优：同 config_version=2 存 OFFLINE(id=2) 与 UPDATE(id=3) 两行（path 不同值）
     *  → diff 选中 OFFLINE 行参与比对（非 UPDATE 优先，selectList 乱序返回也决定论）。 */
    @Test
    void diffPrefersNonUpdateRowForSameConfigVersion() {
        RouteVersion publishAt1 = RouteVersion.builder().id(1L).routeId(7L).configVersion(1L)
                .changeType("PUBLISH")
                .snapshotData(snapshotJson("/api/old", "http://pay:8080", "PUBLISHED", 3, "支付入口"))
                .build();
        RouteVersion offlineAt2 = RouteVersion.builder().id(2L).routeId(7L).configVersion(2L)
                .changeType("OFFLINE")
                .snapshotData(snapshotJson("/api/pay", "http://pay:8080", "OFFLINE", 3, "支付入口"))
                .build();
        RouteVersion updateAt2 = RouteVersion.builder().id(3L).routeId(7L).configVersion(2L)
                .changeType("UPDATE")
                .snapshotData(snapshotJson("/api/pay-v2", "http://pay:8080", "OFFLINE", 3, "支付入口"))
                .build();
        when(routeVersionMapper.selectList(any()))
                .thenReturn(List.of(updateAt2, offlineAt2, publishAt1));

        List<Map<String, Object>> rows = service.diff(7L, 1, 2);

        assertEquals("/api/pay", row(rows, "path").get("to"),
                "to 版本取 OFFLINE 行而非 UPDATE 行（非 UPDATE 优先）");
        assertEquals("OFFLINE", row(rows, "status").get("to"), "status 同样取自 OFFLINE 行");
    }

    /** P0 替换语义：UPDATE@4 已存在 → 再 recordSnapshot UPDATE@4 → delete 触发且 insert
     *  成功不抛（先删后插保证同类型仅留最新一行）。 */
    @Test
    void repeatedUpdateSnapshotReplacesPreviousRow() {
        when(routeVersionMapper.insert(any(RouteVersion.class))).thenReturn(1);
        when(routeVersionMapper.delete(any(Wrapper.class))).thenReturn(1);

        service.recordSnapshot(route(), "UPDATE", "system", null);
        service.recordSnapshot(route(), "UPDATE", "system", "二次修改");

        verify(routeVersionMapper, times(2)).delete(any(Wrapper.class));
        verify(routeVersionMapper, times(2)).insert(any(RouteVersion.class));
        ArgumentCaptor<RouteVersion> captor = ArgumentCaptor.forClass(RouteVersion.class);
        verify(routeVersionMapper, times(2)).insert(captor.capture());
        assertEquals("UPDATE", captor.getAllValues().get(1).getChangeType());
        assertEquals("二次修改", captor.getAllValues().get(1).getChangeDescription(),
                "第二次修改的说明落库（同版本替换行保留最新）");
    }
}
