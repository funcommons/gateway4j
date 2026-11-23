package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.RoutePredicate;
import org.apache.ibatis.annotations.Mapper;

/**
 * 路由级 SCG 原生谓词（S12-1）。
 *
 * <p>数据面一次性 {@code selectList(null)} 全量取数后按 route_id 内存分组
 * （N+1 铁律：禁止逐路由查库）。</p>
 */
@Mapper
public interface RoutePredicateMapper extends BaseMapper<RoutePredicate> {
}
