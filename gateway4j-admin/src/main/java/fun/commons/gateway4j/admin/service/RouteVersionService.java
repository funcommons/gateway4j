package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.mapper.RouteVersionMapper;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.common.model.RouteVersion;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 路由版本快照服务（契约 §4 S5a，docs/ui-v2/实施契约.md）。
 * <p>
 * 发布/下线/修改在 {@code RouteService} 对应事务内调用
 * {@link #recordSnapshot(Route, String, String, String)} 落一行
 * gw_route_version（写失败抛 BusinessException 使主事务回滚）；
 * {@link #listVersions(Long)} 供版本时间线（config_version 倒序），
 * {@link #diff(Long, long, long)} 供两版本逐字段比对（字段集与
 * {@link RouteEnvironmentDiffService} 同口径，未变字段不输出）。
 * <p>
 * <b>actor 方案</b>：RouteService/Controller 无当前用户 accessor 时由调用方
 * 解析（Controller 从 TokenContext 取，取不到为 "system"）并显式传参，
 * 本服务不自行读 SecurityContext。
 * <p>
 * <b>UNIQUE(route_id, config_version, change_type) 撞键策略</b>：PUBLISH/OFFLINE
 * 每次推进 config_version 天然不冲突；UPDATE 不推进版本，同版本多次修改按
 * 「先删后插」替换语义——同 (route_id, config_version, UPDATE) 仅保留最新一次
 * UPDATE 快照；同 (route_id, config_version) 下 PUBLISH/OFFLINE 与 UPDATE 可
 * 并存（下线后修改），diff 取数按「非 UPDATE 优先、同类 id 最大」决定论择优
 * （声明于 V1.5.0 迁移头注释）。
 */
@Service
public class RouteVersionService {

    /** diff 比对字段集（与 RouteEnvironmentDiffService.fieldDiff 同字段同顺序）。 */
    private static final String[] DIFF_FIELDS = {"path", "upstream_url", "status", "sort_order", "remark"};

    private static final String CHANGE_TYPE_UPDATE = "UPDATE";

    private static final int CHANGE_DESCRIPTION_MAX = 500;

    private final RouteVersionMapper routeVersionMapper;
    private final ObjectMapper objectMapper;

    public RouteVersionService(RouteVersionMapper routeVersionMapper, ObjectMapper objectMapper) {
        this.routeVersionMapper = routeVersionMapper;
        this.objectMapper = objectMapper;
    }

    // ==================== 快照写入 ====================

    /**
     * 发布/下线/修改事务内写版本快照（一行 gw_route_version）。
     * <p>
     * 必须在调用方事务内执行（本方法不另开事务）：快照 JSON 序列化失败或
     * insert 受影响行数为 0 均抛 {@link BusinessException}(CONFIG_SYNC_FAILED)，
     * 使发布/下线/修改主事务一并回滚——「配置写失败阻断发布」。
     *
     * @param route             已完成状态/版本变更的路由实体（config_version 取现值）
     * @param changeType        PUBLISH / OFFLINE / UPDATE
     * @param actor             操作人（调用方解析；null 原样落库）
     * @param changeDescription 变更说明（发布请求透传；null 原样落库，超长截断 500）
     */
    public void recordSnapshot(Route route, String changeType, String actor, String changeDescription) {
        if (route == null || route.getId() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路由版本快照缺少路由标识");
        }
        // 键集 snake_case（与 RouteService.toTreeNode / EnvDiff 字段名同口径）
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("route_name", route.getRouteName());
        snapshot.put("route_type", route.getRouteType());
        snapshot.put("path", route.getPath());
        snapshot.put("upstream_url", route.getUpstreamUrl());
        snapshot.put("status", route.getStatus());
        snapshot.put("sort_order", route.getSortOrder() != null ? route.getSortOrder() : 0);
        snapshot.put("remark", route.getRemark() != null ? route.getRemark() : "");
        snapshot.put("tags", route.getTags() != null ? route.getTags() : "");
        String snapshotJson;
        try {
            snapshotJson = objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            // 序列化失败先于任何 DB 操作，insert 不会被调用（阻断发布语义）
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "路由版本快照序列化失败: " + e.getMessage());
        }

        Long version = route.getConfigVersion() != null ? route.getConfigVersion() : 0L;
        if (CHANGE_TYPE_UPDATE.equals(changeType)) {
            // UPDATE 不推进 config_version：同版本重复修改按替换语义先删后插。
            // UNIQUE(route_id, config_version, change_type) 下同类型才撞键，
            // 故仅删本 (route_id, version, UPDATE) 行；与 OFFLINE@N 等其他类型行
            // 并存互不影响。delete 失败同样抛业务异常使修改事务回滚（对齐 insert 侧契约）
            try {
                routeVersionMapper.delete(new LambdaQueryWrapper<RouteVersion>()
                        .eq(RouteVersion::getRouteId, route.getId())
                        .eq(RouteVersion::getConfigVersion, version)
                        .eq(RouteVersion::getChangeType, CHANGE_TYPE_UPDATE));
            } catch (RuntimeException e) {
                throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                        "路由版本快照替换失败: " + e.getMessage());
            }
        }

        RouteVersion record = RouteVersion.builder()
                .routeId(route.getId())
                .configVersion(version)
                .changeType(changeType)
                .snapshotData(snapshotJson)
                .changeDescription(changeDescription != null
                        && changeDescription.length() > CHANGE_DESCRIPTION_MAX
                        ? changeDescription.substring(0, CHANGE_DESCRIPTION_MAX)
                        : changeDescription)
                .actor(actor)
                .publishedAt(OffsetDateTime.now())
                .build();
        int rows;
        try {
            rows = routeVersionMapper.insert(record);
        } catch (RuntimeException e) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "路由版本快照写入失败: " + e.getMessage());
        }
        if (rows <= 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "路由版本快照写入失败（affected 0）");
        }
    }

    // ==================== 版本时间线 ====================

    /** 某路由全部版本快照，按 config_version 倒序（同版本按 id 倒序兜底稳定序）。
     * 路由不存在或无版本返回空列表；存在性由 diff 端点校验。 */
    public List<RouteVersion> listVersions(Long routeId) {
        return routeVersionMapper.selectList(new LambdaQueryWrapper<RouteVersion>()
                .eq(RouteVersion::getRouteId, routeId)
                .orderByDesc(RouteVersion::getConfigVersion)
                .orderByDesc(RouteVersion::getId));
    }

    // ==================== 两版本 diff ====================

    /**
     * 两版本逐字段 diff：平铺 {@code {field, from, to}} 行，未变字段不输出
     * （沿 EnvDiff putIfChanged 惯例）。字段集与 EnvDiff 一致
     * （path/upstream_url/status/sort_order/remark，sort_order null→0、
     * remark null→"" 归一）。单次 selectList（route_id + config_version IN）。
     * <p>
     * <b>同 (route_id, config_version) 多行择优规则</b>：UNIQUE 按 change_type
     * 维度放开后，同版本可有 OFFLINE@N 与 UPDATE@N 并存（下线后修改）。
     * 取行规则决定论：非 UPDATE 行优先（PUBLISH/OFFLINE 是该版本的事件锚点，
     * UPDATE 只是同版本重复修改的替换行）；同为非 UPDATE 或同为 UPDATE 时取
     * id 最大者（后写入者）。规则声明于 V1.5.0 迁移头注释。
     *
     * @throws BusinessException 任一版本不存在（ROUTE_NOT_FOUND=10601，复用不新造）
     */
    public List<Map<String, Object>> diff(Long routeId, long fromVersion, long toVersion) {
        List<RouteVersion> versions = routeVersionMapper.selectList(new LambdaQueryWrapper<RouteVersion>()
                .eq(RouteVersion::getRouteId, routeId)
                .in(RouteVersion::getConfigVersion, List.of(fromVersion, toVersion)));
        Map<Long, RouteVersion> byVersion = new HashMap<>();
        for (RouteVersion v : versions) {
            if (v.getConfigVersion() == null) {
                continue;
            }
            RouteVersion incumbent = byVersion.get(v.getConfigVersion());
            if (incumbent == null || preferVersion(v, incumbent)) {
                byVersion.put(v.getConfigVersion(), v);
            }
        }
        Map<?, ?> fromSnapshot = readSnapshot(requireVersion(byVersion, routeId, fromVersion));
        Map<?, ?> toSnapshot = readSnapshot(requireVersion(byVersion, routeId, toVersion));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (String field : DIFF_FIELDS) {
            Object fromValue = normalizeFieldValue(field, fromSnapshot.get(field));
            Object toValue = normalizeFieldValue(field, toSnapshot.get(field));
            if (!Objects.equals(fromValue, toValue)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("field", field);
                row.put("from", fromValue);
                row.put("to", toValue);
                rows.add(row);
            }
        }
        return rows;
    }

    // ==================== 内部工具 ====================

    /**
     * diff 同版本多行择优（见 {@link #diff} javadoc）：非 UPDATE 行优先，
     * 同类取 id 最大（后写入者）；id 缺失视为最小，不抢占既有行。
     */
    private boolean preferVersion(RouteVersion candidate, RouteVersion incumbent) {
        boolean candidateIsUpdate = CHANGE_TYPE_UPDATE.equals(candidate.getChangeType());
        boolean incumbentIsUpdate = CHANGE_TYPE_UPDATE.equals(incumbent.getChangeType());
        if (candidateIsUpdate != incumbentIsUpdate) {
            return !candidateIsUpdate;
        }
        Long candidateId = candidate.getId();
        Long incumbentId = incumbent.getId();
        return candidateId != null && (incumbentId == null || candidateId > incumbentId);
    }

    /** 版本行必须命中：缺版本 → ROUTE_NOT_FOUND（10601，与快照/路由缺失同码）。 */
    private RouteVersion requireVersion(Map<Long, RouteVersion> byVersion, Long routeId, long version) {
        RouteVersion hit = byVersion.get(version);
        if (hit == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND,
                    "路由 " + routeId + " 的版本不存在: config_version=" + version);
        }
        return hit;
    }

    /** 快照 JSON 反序列化；损坏视为业务异常（与导入快照「数据损坏」同口径），不吞。 */
    private Map<?, ?> readSnapshot(RouteVersion version) {
        try {
            Map<?, ?> snapshot = objectMapper.readValue(version.getSnapshotData(), Map.class);
            return snapshot != null ? snapshot : Map.of();
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "版本快照数据损坏: " + e.getMessage());
        }
    }

    /** diff 读侧归一（与 RouteEnvironmentDiffService.normalizeSortOrder/Remark 同口径）。 */
    private Object normalizeFieldValue(String field, Object value) {
        if ("sort_order".equals(field)) {
            return value != null ? value : 0;
        }
        if ("remark".equals(field)) {
            return value != null ? value : "";
        }
        return value;
    }
}
