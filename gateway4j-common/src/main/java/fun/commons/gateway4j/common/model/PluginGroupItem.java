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
@TableName("gw_plugin_group_item")
public class PluginGroupItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long groupPluginId;

    private Long memberPluginId;

    @Builder.Default
    private Integer sortOrder = 0;

    private OffsetDateTime createdAt;
}
