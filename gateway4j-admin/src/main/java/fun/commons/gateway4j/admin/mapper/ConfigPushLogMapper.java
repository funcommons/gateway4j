package fun.commons.gateway4j.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import fun.commons.gateway4j.common.model.ConfigPushLog;
import org.apache.ibatis.annotations.Select;

/**
 * 配置推送日志 Mapper（gw_config_push_log，按月分区表）。
 */
public interface ConfigPushLogMapper extends BaseMapper<ConfigPushLog> {

    /**
     * 全局最大配置版本号：gw_route 与 gw_plugin 中 config_version 的最大值，
     * 任一表为空按 0 计。用作 Redis 配置变更通知 payload 的 version 字段，
     * 网关实例据此与本地版本比较判断是否需要重载配置。
     */
    @Select("SELECT GREATEST("
            + "COALESCE((SELECT MAX(config_version) FROM gw_route), 0), "
            + "COALESCE((SELECT MAX(config_version) FROM gw_plugin), 0))")
    Long selectMaxGlobalConfigVersion();
}
