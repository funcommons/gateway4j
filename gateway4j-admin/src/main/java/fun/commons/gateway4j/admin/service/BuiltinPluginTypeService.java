package fun.commons.gateway4j.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fun.commons.gateway4j.admin.service.BuiltinPluginTypeRegistry.BuiltinType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BuiltinPluginTypeService {

    private final BuiltinPluginTypeRegistry registry;
    private final ObjectMapper objectMapper;

    public BuiltinPluginTypeService(BuiltinPluginTypeRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    public List<Map<String, Object>> listTypes() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (BuiltinType t : registry.listAll()) {
            result.add(toView(t));
        }
        return result;
    }

    public Map<String, Object> getSchema(String pluginId) {
        BuiltinType t = registry.get(pluginId);
        if (t == null) {
            throw new fun.commons.gateway4j.common.exception.BusinessException(
                    fun.commons.gateway4j.common.constant.ErrorCode.PLUGIN_NOT_FOUND);
        }
        return toView(t);
    }

    public Map<String, Object> validateConfig(String pluginId, String config) {
        List<Map<String, Object>> errors = new ArrayList<>();
        BuiltinType t = registry.get(pluginId);
        if (t == null) {
            errors.add(Map.of("field", "plugin_id", "message", "未知的内置插件类型: " + pluginId));
            return Map.of("is_valid", false, "errors", errors);
        }
        if (config != null && !config.isBlank()) {
            try {
                fun.commons.gateway4j.common.util.JsonUtils.parseObject(config, Map.class);
            } catch (Exception e) {
                errors.add(Map.of("field", "config", "message", "配置不是合法 JSON: " + e.getMessage()));
            }
        }
        return Map.of("is_valid", errors.isEmpty(), "errors", errors);
    }

    private Map<String, Object> toView(BuiltinType t) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("plugin_id", t.pluginId());
        view.put("plugin_name", t.pluginName());
        view.put("plugin_phase", t.pluginPhase());
        view.put("description", t.description());
        // 修复 D21：config_schema 放 JSON 对象（前端按 .properties 读），解析失败才回退原字符串
        view.put("config_schema", parseSchema(t.configSchema()));
        return view;
    }

    private Object parseSchema(String schema) {
        if (schema == null || schema.isBlank()) {
            return schema;
        }
        try {
            return objectMapper.readTree(schema);
        } catch (Exception e) {
            return schema;
        }
    }
}
