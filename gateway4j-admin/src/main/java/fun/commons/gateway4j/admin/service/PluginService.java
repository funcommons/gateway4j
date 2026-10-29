package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.common.mapper.PluginMapper;
import fun.commons.gateway4j.admin.mapper.PluginGroupItemMapper;
import fun.commons.gateway4j.admin.mapper.PluginGroovyMapper;
import fun.commons.gateway4j.common.mapper.RoutePluginBindingMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.Plugin;
import fun.commons.gateway4j.common.model.PluginGroupItem;
import fun.commons.gateway4j.common.model.PluginGroovy;
import fun.commons.gateway4j.common.model.RoutePluginBinding;
import fun.commons.gateway4j.engine.config.event.ConfigChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PluginService extends ServiceImpl<PluginMapper, Plugin> {

    private final PluginGroupItemMapper groupItemMapper;
    private final PluginGroovyMapper groovyMapper;
    private final RoutePluginBindingMapper bindingMapper;
    private final ApplicationEventPublisher eventPublisher;

    public PluginService(PluginGroupItemMapper groupItemMapper,
                         PluginGroovyMapper groovyMapper,
                         RoutePluginBindingMapper bindingMapper,
                         ApplicationEventPublisher eventPublisher) {
        this.groupItemMapper = groupItemMapper;
        this.groovyMapper = groovyMapper;
        this.bindingMapper = bindingMapper;
        this.eventPublisher = eventPublisher;
    }

    private void publishPluginChange(Long pluginId, String scope, Long version, String changeType) {
        String configType = "GLOBAL".equals(scope) ? "GLOBAL_PLUGIN" : "PLUGIN";
        eventPublisher.publishEvent(new ConfigChangeEvent(this, configType, pluginId, version, changeType));
    }

    public Page<Plugin> listPlugins(int page, int pageSize, String pluginType,
                                     String pluginPhase, String scope, String status, String keyword) {
        LambdaQueryWrapper<Plugin> wrapper = new LambdaQueryWrapper<>();
        if (pluginType != null) {
            wrapper.eq(Plugin::getPluginType, pluginType);
        }
        if (pluginPhase != null) {
            wrapper.eq(Plugin::getPluginPhase, pluginPhase);
        }
        if (scope != null) {
            wrapper.eq(Plugin::getScope, scope);
        }
        if (status != null) {
            wrapper.eq(Plugin::getStatus, status);
        }
        // 修复 D6：keyword 模糊匹配插件名称 / 插件标识
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.and(w -> w.like(Plugin::getPluginName, keyword)
                    .or().like(Plugin::getPluginId, keyword));
        }
        wrapper.orderByAsc(Plugin::getSortOrder);
        return page(new Page<>(page, pageSize), wrapper);
    }

    public List<Plugin> listGlobalPlugins(String pluginPhase) {
        LambdaQueryWrapper<Plugin> wrapper = new LambdaQueryWrapper<Plugin>()
                .eq(Plugin::getScope, "GLOBAL")
                .eq(Plugin::getStatus, "ENABLED");
        if (pluginPhase != null) {
            wrapper.eq(Plugin::getPluginPhase, pluginPhase);
        }
        wrapper.orderByAsc(Plugin::getSortOrder);
        return list(wrapper);
    }

    /**
     * 插件详情（修复契约缺口：前端 getPlugin(id) 插件编辑页生产调用）。
     * 除 gw_plugin 字段外，附加编辑页需要的扩展数据：
     * GROOVY → script_content（gw_plugin_groovy）；GROUP → group_member_ids（gw_plugin_group_item）。
     * 键为 snake_case，与全局 Jackson 序列化形态一致。
     */
    public Map<String, Object> getPluginDetail(Long pluginId) {
        Plugin plugin = getById(pluginId);
        if (plugin == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("id", String.valueOf(plugin.getId()));
        detail.put("plugin_name", plugin.getPluginName());
        detail.put("plugin_id", plugin.getPluginId());
        detail.put("plugin_type", plugin.getPluginType());
        detail.put("plugin_phase", plugin.getPluginPhase());
        detail.put("scope", plugin.getScope());
        detail.put("status", plugin.getStatus());
        detail.put("sort_order", plugin.getSortOrder());
        detail.put("config", plugin.getConfig());
        detail.put("remark", plugin.getRemark());
        detail.put("config_version", plugin.getConfigVersion() != null
                ? String.valueOf(plugin.getConfigVersion()) : "0");
        if ("GROOVY".equals(plugin.getPluginType())) {
            PluginGroovy groovy = groovyMapper.selectOne(new LambdaQueryWrapper<PluginGroovy>()
                    .eq(PluginGroovy::getPluginId, pluginId));
            detail.put("script_content", groovy != null ? groovy.getScriptContent() : "");
        }
        if ("GROUP".equals(plugin.getPluginType())) {
            List<Long> memberIds = new ArrayList<>();
            for (PluginGroupItem item : groupItemMapper.selectList(new LambdaQueryWrapper<PluginGroupItem>()
                    .eq(PluginGroupItem::getGroupPluginId, pluginId)
                    .orderByAsc(PluginGroupItem::getSortOrder))) {
                memberIds.add(item.getMemberPluginId());
            }
            detail.put("group_member_ids", memberIds);
        }
        return detail;
    }

    @Transactional
    public Plugin createPlugin(Plugin plugin, List<Long> groupMemberIds, String scriptContent) {
        validateCreateFields(plugin, groupMemberIds);
        validatePluginIdUnique(plugin.getPluginId(), null);
        save(plugin);
        if ("GROUP".equals(plugin.getPluginType()) && groupMemberIds != null) {
            int order = 0;
            for (Long memberId : groupMemberIds) {
                PluginGroupItem item = PluginGroupItem.builder()
                        .groupPluginId(plugin.getId())
                        .memberPluginId(memberId)
                        .sortOrder(order++)
                        .build();
                groupItemMapper.insert(item);
            }
        }
        publishPluginChange(plugin.getId(), plugin.getScope(), plugin.getConfigVersion(), "CREATE");
        return plugin;
    }

    @Transactional
    public void updatePlugin(Plugin plugin) {
        Plugin existing = getById(plugin.getId());
        if (existing == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        if (plugin.getPluginId() != null && !plugin.getPluginId().equals(existing.getPluginId())) {
            validatePluginIdUnique(plugin.getPluginId(), plugin.getId());
        }
        updateById(plugin);
        publishPluginChange(plugin.getId(), existing.getScope(), existing.getConfigVersion(), "UPDATE");
    }

    @Transactional
    public void deletePlugin(Long pluginId) {
        Plugin existing = getById(pluginId);
        if (existing == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        if ("BUILTIN".equals(existing.getPluginType())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "内置插件不可删除");
        }
        if ("ENABLED".equals(existing.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "启用中的插件不可删除，请先禁用");
        }
        getBaseMapper().deleteById(pluginId);
        groupItemMapper.delete(new LambdaQueryWrapper<PluginGroupItem>()
                .eq(PluginGroupItem::getGroupPluginId, pluginId));
        bindingMapper.delete(new LambdaQueryWrapper<RoutePluginBinding>()
                .eq(RoutePluginBinding::getPluginId, pluginId));
        publishPluginChange(pluginId, existing.getScope(), existing.getConfigVersion(), "DELETE");
    }

    @Transactional
    public Plugin enablePlugin(Long pluginId) {
        Plugin plugin = getById(pluginId);
        if (plugin == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        if ("ENABLED".equals(plugin.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "插件已处于启用状态");
        }
        plugin.setStatus("ENABLED");
        updateById(plugin);
        publishPluginChange(pluginId, plugin.getScope(), plugin.getConfigVersion(), "ENABLE");
        return plugin;
    }

    @Transactional
    public Plugin disablePlugin(Long pluginId) {
        Plugin plugin = getById(pluginId);
        if (plugin == null) {
            throw new BusinessException(ErrorCode.PLUGIN_NOT_FOUND);
        }
        if ("DISABLED".equals(plugin.getStatus())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "插件已处于禁用状态");
        }
        plugin.setStatus("DISABLED");
        updateById(plugin);
        publishPluginChange(pluginId, plugin.getScope(), plugin.getConfigVersion(), "DISABLE");
        return plugin;
    }

    @Transactional
    public void sortGlobalPlugins(String pluginPhase, List<Long> pluginIds) {
        if (pluginPhase == null || pluginPhase.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "plugin_phase 不能为空");
        }
        int order = 0;
        for (Long id : pluginIds) {
            Plugin plugin = getById(id);
            if (plugin != null && "GLOBAL".equals(plugin.getScope())) {
                plugin.setSortOrder(order++);
                updateById(plugin);
            }
        }
    }

    private void validateCreateFields(Plugin plugin, List<Long> groupMemberIds) {
        if (plugin.getPluginName() == null || plugin.getPluginName().isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "插件名称不能为空");
        }
        if (plugin.getPluginId() == null || plugin.getPluginId().isEmpty()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "插件标识不能为空");
        }
        if (plugin.getPluginType() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "插件类型不能为空");
        }
        if (plugin.getPluginPhase() == null) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "插件阶段不能为空");
        }
        if ("GROUP".equals(plugin.getPluginType()) && (groupMemberIds == null || groupMemberIds.isEmpty())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "分组插件必须包含至少一个成员");
        }
    }

    private void validatePluginIdUnique(String pluginId, Long excludeId) {
        LambdaQueryWrapper<Plugin> wrapper = new LambdaQueryWrapper<Plugin>()
                .eq(Plugin::getPluginId, pluginId);
        if (excludeId != null) {
            wrapper.ne(Plugin::getId, excludeId);
        }
        if (count(wrapper) > 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "插件标识已存在: " + pluginId);
        }
    }
}
