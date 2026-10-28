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
@TableName("gw_role_permission_rel")
public class RolePermissionRel {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String roleCode;

    private String permissionCode;

    private OffsetDateTime createdAt;
}
