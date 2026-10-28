package fun.commons.gateway4j.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RoutePluginBindingMapper extends BaseMapper<RoutePluginBinding> {

    /** 物理删除全量路由-插件绑定（仅导入回滚事务内使用）。 */
    @Delete("DELETE FROM gw_route_plugin_binding")
    int deleteAllHard();
}
