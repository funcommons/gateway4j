package fun.commons.gateway4j.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.RouteCanvas;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RouteCanvasMapper extends BaseMapper<RouteCanvas> {

    /** 物理删除全量画布数据（仅导入回滚事务内使用，路由已重建画布可重新推导）。 */
    @Delete("DELETE FROM gw_route_canvas")
    int deleteAllHard();
}
