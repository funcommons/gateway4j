package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import fun.commons.gateway4j.common.util.JsonbTypeHandler;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/**
 * 路由版本快照（gw_route_version）：发布/下线/修改事务内写入的一行配置快照，
 * 供版本时间线（listVersions）与两版本逐字段 diff（契约 §4 S5a）。
 * <p>
 * JSONB 映射方式沿用 {@link ImportSnapshot} 先例：实体持 String +
 * {@link JsonbTypeHandler}（insert 经 PGobject 写入，select 走 getString）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route_version")
public class RouteVersion {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 路由 ID（gw_route.id，应用层保证一致性，无外键）。 */
    private Long routeId;

    /** 快照时的路由配置版本号（gw_route.config_version，BIGINT 对齐源列）。 */
    private Long configVersion;

    /** 变更类型：PUBLISH=发布 / OFFLINE=下线 / UPDATE=修改。 */
    private String changeType;

    /** 路由配置快照 JSON（键集 snake_case，与 RouteService.toTreeNode 同口径）。 */
    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String snapshotData = "{}";

    /** 变更说明（发布请求 change_description 透传；可空，不兜默认串）。 */
    private String changeDescription;

    /** 操作人（登录名；系统内部调用为 system；可空）。 */
    private String actor;

    /** 快照时间（服务层显式赋值；DB 侧 now() 缺省，兼作 created_at）。 */
    private OffsetDateTime publishedAt;
}
