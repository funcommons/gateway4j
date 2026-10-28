package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.admin.mapper.ConfigMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.Config;
import fun.commons.gateway4j.common.util.JsonUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 系统设置（gw_config）读写：按 config_type 存取 JSON 配置。
 * 无记录时返回空对象（前端表单自带默认值）。
 */
@Service
public class ConfigService extends ServiceImpl<ConfigMapper, Config> {

    private static final Pattern CONFIG_TYPE_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{1,50}$");

    @SuppressWarnings("unchecked")
    public Map<String, Object> getConfig(String configType) {
        validateConfigType(configType);
        Config config = getById(configType);
        if (config == null || config.getConfigData() == null || config.getConfigData().isBlank()) {
            return new LinkedHashMap<>();
        }
        return JsonUtils.parseObject(config.getConfigData(), LinkedHashMap.class);
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> saveConfig(String configType, Map<String, Object> configData) {
        validateConfigType(configType);
        String json = JsonUtils.toCompactJson(configData != null ? configData : new LinkedHashMap<>());
        Config existing = getById(configType);
        if (existing == null) {
            save(Config.builder()
                    .configType(configType)
                    .configData(json)
                    .build());
        } else {
            existing.setConfigData(json);
            updateById(existing);
        }
        return JsonUtils.parseObject(json, LinkedHashMap.class);
    }

    private void validateConfigType(String configType) {
        if (configType == null || !CONFIG_TYPE_PATTERN.matcher(configType).matches()) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED,
                    "非法的配置类型: " + configType);
        }
    }
}
