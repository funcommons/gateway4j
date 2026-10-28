package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
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
@TableName("gw_route_plugin_binding")
public class RoutePluginBinding {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long routeId;

    private Long pluginId;

    @Builder.Default
    private Integer sortOrder = 0;

    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String bindingConfig = "{}";

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
