package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;

public class PluginLoadException extends BusinessException {

    public PluginLoadException(String detail) {
        super(ErrorCode.PLUGIN_LOAD_FAILED, detail);
    }

    public PluginLoadException(String detail, Throwable cause) {
        super(ErrorCode.PLUGIN_LOAD_FAILED, cause);
    }
}
