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
@TableName("gw_config_push_log")
public class ConfigPushLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String configType;

    private Long configId;

    private Long configVersion;

    private String changeType;

    private String instanceId;

    @Builder.Default
    private String pushStatus = "PENDING";

    private String errorMessage;

    @Builder.Default
    private Integer retryCount = 0;

    private OffsetDateTime confirmedAt;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;
}
