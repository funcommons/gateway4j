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
     *
     * <p>必须过滤软删除行（is_deleted=0）：已删除的 route/plugin 永远不会出现在
     * 网关装载快照里，若参与取最大值，e2e 等场景删除高版本测试路由后会把
     * db_version 永久顶高，sync-status 的 in_sync 永远为 false（2026-10-30 实测）。</p>
     */
    @Select("SELECT GREATEST("
            + "COALESCE((SELECT MAX(config_version) FROM gw_route WHERE is_deleted = 0), 0), "
            + "COALESCE((SELECT MAX(config_version) FROM gw_plugin WHERE is_deleted = 0), 0))")
    Long selectMaxGlobalConfigVersion();
}
