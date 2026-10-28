package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.*;
import fun.commons.gateway4j.common.util.JsonbTypeHandler;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_plugin")
public class Plugin {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private String pluginName;

    private String pluginId;

    private String pluginType;

    private String pluginPhase;

    @Builder.Default
    private String scope = "ROUTE";

    @Builder.Default
    private String status = "DISABLED";

    @Builder.Default
    private Integer sortOrder = 0;

    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String config = "{}";

    private String remark;

    @Builder.Default
    private Long configVersion = 0L;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
