package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiException;
import fun.commons.gateway4j.common.constant.*;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DictService {

    private final BuiltinPluginTypeRegistry builtinRegistry;

    public DictService(BuiltinPluginTypeRegistry builtinRegistry) {
        this.builtinRegistry = builtinRegistry;
    }

    public List<Map<String, String>> getDict(String dictCode) {
        return switch (dictCode) {
            case "ROUTE_TYPE" -> ofEnum(RouteType.values(), Map.of("DISPATCH", "分发路由", "BACKEND", "后置路由"));
            case "ROUTE_STATUS" -> ofEnum(RouteStatus.values(), Map.of(
                    "DRAFT", "草稿", "PUBLISHED", "已发布", "OFFLINE", "已下线", "CHANGING", "变更中"));
            case "PLUGIN_TYPE" -> ofEnum(PluginType.values(), Map.of(
                    "BUILTIN", "内置插件", "JAR", "JAR 插件", "GROOVY", "Groovy 脚本插件", "GROUP", "分组插件"));
            case "PLUGIN_PHASE" -> ofEnum(PluginPhase.values(), Map.of("PRE", "前置阶段", "POST", "后置阶段"));
            case "PLUGIN_SCOPE" -> ofEnum(PluginScope.values(), Map.of("GLOBAL", "全局作用域", "ROUTE", "路由作用域"));
            case "PLUGIN_STATUS" -> ofEnum(PluginStatus.values(), Map.of("ENABLED", "已启用", "DISABLED", "已禁用"));
            case "COND_TYPE" -> ofEnum(ConditionType.values(), Map.of(
                    "HEADER", "请求头条件", "PATH", "路径条件", "QUERY", "查询参数条件",
                    "BODY", "请求体条件", "GROOVY", "Groovy 脚本条件",
                    // H5a 遗留收录：ConditionType.values() 自 WEIGHT 起含 6 值，
                    // 此前缺标签回落为枚举码「WEIGHT」；校验侧无白名单（条件类型
                    // 全程字符串透传），字典仅影响展示。
                    "WEIGHT", "权重分流"));
            case "COND_OPERATOR" -> ofEnum(ConditionOperator.values(), Map.of(
                    "EQ", "等于", "NE", "不等于", "CONTAINS", "包含", "REGEX", "正则匹配",
                    "EXISTS", "存在", "GT", "大于", "LT", "小于"));
            case "BUILTIN_PLUGIN" -> builtinPlugins();
            // 修复 D10：未知字典使用资源不存在语义（10400），而非落入兜底 500「系统繁忙」
            default -> throw new ApiException(ApiCode.NOT_FOUND, "未知字典: " + dictCode);
        };
    }

    private List<Map<String, String>> ofEnum(CodeEnum[] values, Map<String, String> labels) {
        List<Map<String, String>> result = new ArrayList<>();
        for (CodeEnum value : values) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("value", value.code());
            item.put("label", labels.getOrDefault(value.code(), value.code()));
            result.add(item);
        }
        return result;
    }

    private List<Map<String, String>> builtinPlugins() {
        List<Map<String, String>> result = new ArrayList<>();
        for (BuiltinPluginTypeRegistry.BuiltinType t : builtinRegistry.listAll()) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("value", t.pluginId());
            item.put("label", t.pluginName());
            result.add(item);
        }
        return result;
    }
}
