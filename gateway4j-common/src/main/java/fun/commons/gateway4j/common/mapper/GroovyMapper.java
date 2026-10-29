package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.PluginGroovy;
import org.apache.ibatis.annotations.Mapper;

/**
 * Engine-side read access to {@code gw_plugin_groovy} (ADR-003 phase 1: the
 * gateway-boot data plane sandbox-compiles ENABLED GROOVY rows itself).
 *
 * <p>Deliberately named {@code GroovyMapper} — NOT {@code PluginGroovyMapper} —
 * because admin-boot's {@code @MapperScan} covers BOTH {@code admin.mapper} and
 * {@code common.mapper}; duplicate simple names would collide on the derived
 * bean name ({@code pluginGroovyMapper}) and fail the admin-boot context. The
 * admin side keeps its own {@code admin.mapper.PluginGroovyMapper}.</p>
 */
@Mapper
public interface GroovyMapper extends BaseMapper<PluginGroovy> {
}
