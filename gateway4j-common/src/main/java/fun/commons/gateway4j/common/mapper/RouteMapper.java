package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.Route;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RouteMapper extends BaseMapper<Route> {

    /** 物理删除全量路由（仅导入回滚事务内使用；日常删除走逻辑删除）。 */
    @Delete("DELETE FROM gw_route")
    int deleteAllHard();
}
