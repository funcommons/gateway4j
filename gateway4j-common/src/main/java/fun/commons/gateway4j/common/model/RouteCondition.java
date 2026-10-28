package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route_condition")
public class RouteCondition {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long routeId;

    private Long targetRouteId;

    private String conditionType;

    private String operator;

    private String conditionKey;

    private String conditionValue;

    @Builder.Default
    private Integer priority = 0;

    private OffsetDateTime createdAt;
}
