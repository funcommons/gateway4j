package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route")
public class Route {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private String routeName;

    private String routeType;

    private String path;

    private String upstreamUrl;

    @Builder.Default
    private String status = "DRAFT";

    private Long parentRouteId;

    @Builder.Default
    private Integer sortOrder = 0;

    private String remark;

    @Builder.Default
    private String tags = "";

    @Builder.Default
    private Long configVersion = 0L;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
