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

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_config")
public class Config {

    @TableId(type = IdType.INPUT)
    private String configType;

    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String configData = "{}";

    private OffsetDateTime updatedAt;
}
