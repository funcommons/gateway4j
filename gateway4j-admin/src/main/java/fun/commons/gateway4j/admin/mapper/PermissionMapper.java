package fun.commons.gateway4j.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.Permission;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PermissionMapper extends BaseMapper<Permission> {
}
