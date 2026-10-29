package fun.commons.gateway4j.common.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.PluginJar;
import org.apache.ibatis.annotations.Mapper;

/**
 * Engine-side read access to {@code gw_plugin_jar} (ADR-003 phase 1: the
 * gateway-boot data plane loads ENABLED JAR rows from the admin upload
 * storage — read-only; admin owns the writes).
 *
 * <p>Deliberately named {@code PluginJarFileMapper} — NOT {@code PluginJarMapper}
 * — because admin-boot's {@code @MapperScan} covers BOTH {@code admin.mapper}
 * and {@code common.mapper}; duplicate simple names would collide on the
 * derived bean name ({@code pluginJarMapper}).</p>
 */
@Mapper
public interface PluginJarFileMapper extends BaseMapper<PluginJar> {
}
