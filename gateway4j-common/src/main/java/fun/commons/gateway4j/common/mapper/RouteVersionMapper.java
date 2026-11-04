package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.RouteVersion;
import org.apache.ibatis.annotations.Mapper;

/**
 * 路由版本快照 Mapper（gw_route_version，契约 §4 S5a）。
 * <p>
 * 放 common.mapper：admin-boot 的 {@code @MapperScan} 同时覆盖
 * {@code admin.mapper} 与 {@code common.mapper}（同 {@link RouteMapper} 先例）。
 */
@Mapper
public interface RouteVersionMapper extends BaseMapper<RouteVersion> {
}
