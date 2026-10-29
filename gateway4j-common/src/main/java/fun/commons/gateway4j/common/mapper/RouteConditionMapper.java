package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.RouteCondition;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RouteConditionMapper extends BaseMapper<RouteCondition> {

    /** 物理删除全量分发条件（仅导入回滚事务内使用）。 */
    @Delete("DELETE FROM gw_route_condition")
    int deleteAllHard();
}
