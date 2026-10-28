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
 * 导入快照（gw_import_snapshot）：全量路由（含 conditions/bindings）序列化存档，
 * 供 POST /v1/routes/import/rollback 事务内恢复。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_import_snapshot")
public class ImportSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String snapshotData = "{}";

    @Builder.Default
    private Integer routeCount = 0;

    private OffsetDateTime createdAt;
}
